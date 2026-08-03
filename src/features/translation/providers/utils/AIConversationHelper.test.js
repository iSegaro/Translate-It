import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/config/config.js', () => ({
  getPromptAsync: vi.fn(),
  getPromptAutoAsync: vi.fn(),
  getPromptBASEAIBatchAsync: vi.fn(),
  getPromptBASEAIBatchAutoAsync: vi.fn(),
  getPromptBASEAIFollowupAsync: vi.fn(),
  getPromptBASEAIFollowupAutoAsync: vi.fn(),
  getAIContextTranslationEnabledAsync: vi.fn().mockResolvedValue(false),
  getAIConversationHistoryEnabledAsync: vi.fn().mockResolvedValue(false),
  getSourceLanguageAsync: vi.fn().mockResolvedValue('auto'),
  TranslationMode: {
    Select_Element: 'select-element',
    Dictionary_Translation: 'dictionary',
    Field: 'content',
    Page: 'page',
    PDF: 'pdf-translation',
    Subtitle: 'subtitle',
  }
}));

vi.mock('@/shared/config/languageConstants.js', () => ({
  getLanguageNameFromCode: vi.fn((code) => ({
    en: 'english',
    fa: 'persian'
  }[code] || code)),
  getCanonicalCode: vi.fn((code) => code),
}));

vi.mock('@/features/translation/utils/NewlineManager.js', () => ({
  NewlineManager: {
    protect: vi.fn((text) => text),
  }
}));

vi.mock('@/features/translation/utils/bilingualPromptHelper.js', () => ({
  shouldUseAutoPromptAsync: vi.fn().mockResolvedValue(false),
}));

import { AIConversationHelper } from './AIConversationHelper.js';
import { translationSessionManager } from '@/features/translation/core/TranslationSessionManager.js';
import { TranslationCallPurpose } from '../ProviderConstants.js';

describe('AIConversationHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationSessionManager.sessions.clear();
  });

  describe('committed-history eligibility', () => {
    it('keeps failed-attempt-only sessions first-turn eligible', async () => {
      const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
      getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
      const session = translationSessionManager.getOrCreateSession('failed-attempts', 'OpenAI');
      session.turnCounter = 3;

      expect(await AIConversationHelper.isFirstTurn(session.id)).toBe(true);
      await expect(AIConversationHelper.getConversationMessages(
        session.id, 'OpenAI', 'current', 'system', 'select-element'
      )).resolves.toMatchObject({
        messages: [{ role: 'system', content: 'system' }, { role: 'user', content: 'current' }],
      });
      const { getPromptAsync, getPromptBASEAIBatchAsync, getPromptBASEAIFollowupAsync } = await import('@/shared/config/config.js');
      getPromptAsync.mockResolvedValue('instructions $_{SOURCE} $_{TARGET}');
      getPromptBASEAIBatchAsync.mockResolvedValue('base $_{PROMPT_INSTRUCTIONS} $_{TEXT}');
      getPromptBASEAIFollowupAsync.mockResolvedValue('follow-up $_{PROMPT_INSTRUCTIONS} $_{TEXT}');
      await expect(AIConversationHelper.preparePromptAndText(
        ['current'], 'en', 'fa', 'select-element', 'ai', session.id
      )).resolves.toMatchObject({ systemPrompt: expect.stringContaining('base') });
      expect(getPromptBASEAIFollowupAsync).not.toHaveBeenCalled();
      getAIConversationHistoryEnabledAsync.mockResolvedValue(false);
    });

    it('recognizes only ordered user-assistant history pairs', async () => {
      const invalidHistories = [
        [{ role: 'assistant', content: 'result' }],
        [{ role: 'user', content: 'source' }],
        [{ role: 'assistant', content: 'result' }, { role: 'user', content: 'source' }],
        [{ role: 'user', content: 'one' }, { role: 'user', content: 'two' }],
        [{ role: 'assistant', content: 'one' }, { role: 'assistant', content: 'two' }],
        [null, { role: 'user', content: 'source' }],
        [{ role: 'user' }, { type: 'assistant' }],
      ];

      for (const [index, history] of invalidHistories.entries()) {
        const session = translationSessionManager.getOrCreateSession(`invalid-${index}`, 'OpenAI');
        session.turnCounter = 10;
        session.history = history;
        await expect(AIConversationHelper.isFirstTurn(session.id)).resolves.toBe(true);
      }

      const valid = translationSessionManager.getOrCreateSession('valid-pair', 'OpenAI');
      valid.turnCounter = 1;
      valid.history = [{ role: 'system', content: 'ignored' }, { role: 'user', content: 'source' }, { role: 'assistant', content: 'result' }];
      await expect(AIConversationHelper.isFirstTurn(valid.id)).resolves.toBe(false);
    });

    it('becomes follow-up eligible only after a committed history write', async () => {
      const session = translationSessionManager.getOrCreateSession('commit-transition', 'OpenAI');
      session.turnCounter = 10;

      await expect(AIConversationHelper.isFirstTurn(session.id)).resolves.toBe(true);
      await AIConversationHelper.updateSessionHistory(session.id, 'source', 'result');

      await expect(AIConversationHelper.isFirstTurn(session.id)).resolves.toBe(false);
      expect(session.batchCount).toBe(1);
      expect(session.history).toHaveLength(2);
    });
  });

  it('keeps recovery calls outside conversation state', async () => {
    const session = translationSessionManager.getOrCreateSession('recovery-session', 'OpenAI');
    session.turnCounter = 4;
    session.batchCount = 2;
    session.history.push({ role: 'user', content: 'old' }, { role: 'assistant', content: 'translated' });
    const before = structuredClone(session);
    const options = { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY };

    expect(await AIConversationHelper.claimNextTurn('recovery-session', 'OpenAI', options)).toBe(1);
    expect(await AIConversationHelper.getConversationMessages('recovery-session', 'OpenAI', 'current', 'system', 'select-element', options))
      .toEqual({ messages: [{ role: 'system', content: 'system' }, { role: 'user', content: 'current' }], session: null });
    expect(await AIConversationHelper.getConversationHistory('recovery-session', 'select-element', options)).toEqual([]);
    expect(await AIConversationHelper.formatCompactHistoryContext('recovery-session', 'select-element', options)).toBe('');
    await AIConversationHelper.updateSessionHistory('recovery-session', 'current', 'result', options);

    expect(translationSessionManager.sessions.get('recovery-session')).toEqual(before);
  });

  it.each([
    ['primary', TranslationCallPurpose.PRIMARY_TRANSLATION],
    ['missing', undefined],
    ['invalid', 'INVALID_PURPOSE'],
  ])('keeps %s purpose in normal conversation lifecycle', async (_label, callPurpose) => {
    const { getAIConversationHistoryEnabledAsync } = await import('@/shared/config/config.js');
    getAIConversationHistoryEnabledAsync.mockResolvedValue(true);
    const session = translationSessionManager.getOrCreateSession(`compat-${_label}`, 'OpenAI');
    session.history.push({ role: 'user', content: 'old' }, { role: 'assistant', content: 'translated' });
    const options = callPurpose === undefined ? {} : { callPurpose };

    expect(await AIConversationHelper.claimNextTurn(session.id, 'OpenAI', options)).toBe(1);
    expect(await AIConversationHelper.getConversationHistory(session.id, 'select-element', { ...options, maxTurns: 1, maxChars: 100 }))
      .toEqual([{ user: 'old', assistant: 'translated' }]);
    await AIConversationHelper.updateSessionHistory(session.id, 'new', 'new translated', options);

    expect(session.turnCounter).toBe(1);
    expect(session.batchCount).toBe(1);
    expect(session.history).toHaveLength(4);
  });

  it('uses the non-auto batch prompt when bilingual auto prompts are disabled', async () => {
    const { getPromptAsync, getPromptAutoAsync, getPromptBASEAIBatchAsync, getPromptBASEAIBatchAutoAsync } = await import('@/shared/config/config.js');

    getPromptAsync.mockResolvedValue('INSTRUCTIONS: translate from $_{SOURCE} to $_{TARGET}');
    getPromptAutoAsync.mockResolvedValue('INSTRUCTIONS_AUTO: translate into $_{TARGET}');
    getPromptBASEAIBatchAsync.mockResolvedValue('BATCH: translate from _{SOURCE} to _{TARGET}\n$_{PROMPT_INSTRUCTIONS}\n$_{TEXT}');
    getPromptBASEAIBatchAutoAsync.mockResolvedValue('BATCH_AUTO: translate into _{TARGET}\n$_{PROMPT_INSTRUCTIONS}\n$_{TEXT}');

    const { systemPrompt, userText } = await AIConversationHelper.preparePromptAndText(
      ['Hello'],
      'auto',
      'fa',
      'select-element',
      'ai'
    );

    expect(getPromptAsync).toHaveBeenCalled();
    expect(getPromptAutoAsync).not.toHaveBeenCalled();
    expect(getPromptBASEAIBatchAsync).toHaveBeenCalled();
    expect(getPromptBASEAIBatchAutoAsync).not.toHaveBeenCalled();
    expect(systemPrompt).toContain('BATCH: translate from English to Persian');
    expect(systemPrompt).not.toContain('BATCH_AUTO');
    expect(userText).toContain('"translations"');
  });

  it('uses the batch prompt for PDF structured translation without select-element coupling', async () => {
    const { getPromptAsync, getPromptAutoAsync, getPromptBASEAIBatchAsync, getPromptBASEAIBatchAutoAsync } = await import('@/shared/config/config.js');

    getPromptAsync.mockResolvedValue('INSTRUCTIONS: translate from $_{SOURCE} to $_{TARGET}');
    getPromptAutoAsync.mockResolvedValue('INSTRUCTIONS_AUTO: translate into $_{TARGET}');
    getPromptBASEAIBatchAsync.mockResolvedValue('PDF_BATCH: translate from _{SOURCE} to _{TARGET}\n$_{PROMPT_INSTRUCTIONS}\n$_{TEXT}');
    getPromptBASEAIBatchAutoAsync.mockResolvedValue('PDF_BATCH_AUTO: translate into _{TARGET}\n$_{PROMPT_INSTRUCTIONS}\n$_{TEXT}');

    const { systemPrompt, userText } = await AIConversationHelper.preparePromptAndText(
      [{ i: 'b1', t: 'Hello', blockId: 'b1' }],
      'auto',
      'fa',
      'pdf-translation',
      'ai'
    );

    expect(getPromptBASEAIBatchAsync).toHaveBeenCalled();
    expect(systemPrompt).toContain('PDF_BATCH: translate from English to Persian');
    expect(systemPrompt).not.toContain('select');
    expect(userText).toContain('"translations"');
  });

  it('keeps existing provider payload identities independent of internal manifests', async () => {
    const { getPromptAsync, getPromptBASEAIBatchAsync } = await import('@/shared/config/config.js');
    getPromptAsync.mockResolvedValue('INSTRUCTIONS: translate from $_{SOURCE} to $_{TARGET}');
    getPromptBASEAIBatchAsync.mockResolvedValue('BATCH: $_{PROMPT_INSTRUCTIONS}');

    const { userText } = await AIConversationHelper.preparePromptAndText(
      [{ i: 'provider-id', t: 'Hello' }],
      'en',
      'fa',
      'select-element',
      'ai'
    );

    expect(JSON.parse(userText)).toEqual({
      translations: [{ id: 'provider-id', text: 'Hello' }]
    });
  });

  it('correctly assembles subtitle prompt with base, user, and batch instructions', async () => {
    const metadata = {
      promptTemplate: 'BASE: $_{PROMPT_INSTRUCTIONS}\nFORMAT: $_{BATCH_INSTRUCTION}\nTEXT: $_{TEXT}',
      instruction: 'USER: translate into $_{TARGET}',
      batchInstruction: 'BATCH: return JSON for $_{TARGET}'
    };

    const { systemPrompt } = await AIConversationHelper.preparePromptAndText(
      ['Subtitle line'],
      'en',
      'fa',
      'subtitle',
      'ai',
      null,
      metadata
    );

    expect(systemPrompt).toContain('BASE: USER: translate into Persian');
    expect(systemPrompt).toContain('FORMAT: BATCH: return JSON for Persian');
    expect(systemPrompt).toContain('TEXT: the text provided in the user message');
  });

  it('strips $_{TEXT} from custom instructions to prevent nesting', async () => {
    const metadata = {
      promptTemplate: 'BASE: $_{PROMPT_INSTRUCTIONS}\nBATCH: $_{BATCH_INSTRUCTION}\n$_{TEXT}',
      instruction: 'USER RULE $_{TEXT}',
      batchInstruction: 'BATCH RULE $_{TEXT}'
    };

    const { systemPrompt } = await AIConversationHelper.preparePromptAndText(
      ['Text'],
      'en',
      'fa',
      'subtitle',
      'ai',
      null,
      metadata
    );

    // Should not contain duplicate "the text provided..."
    const textReplacement = 'the text provided in the user message';
    const occurrences = (systemPrompt.match(new RegExp(textReplacement, 'g')) || []).length;
    expect(occurrences).toBe(1);
    expect(systemPrompt).toContain('USER RULE ');
    expect(systemPrompt).toContain('BATCH RULE ');
  });

  it('formats compact Select Element history from the active session only', async () => {
    const { getAIConversationHistoryEnabledAsync, TranslationMode } = await import('@/shared/config/config.js');
    getAIConversationHistoryEnabledAsync.mockResolvedValue(true);

    const activeSessionId = 'session-active';
    const otherSessionId = 'session-other';

    translationSessionManager.sessions.set(activeSessionId, {
      id: activeSessionId,
      provider: 'WebAI',
      history: [
        { role: 'user', content: 'Previous original text' },
        { role: 'assistant', content: 'Previous translated text' }
      ]
    });

    translationSessionManager.sessions.set(otherSessionId, {
      id: otherSessionId,
      provider: 'WebAI',
      history: [
        { role: 'user', content: 'Wrong session original' },
        { role: 'assistant', content: 'Wrong session translated' }
      ]
    });

    const context = await AIConversationHelper.formatCompactHistoryContext(activeSessionId, TranslationMode.Select_Element);

    expect(context).toContain('Previous translation context:');
    expect(context).toContain('Original:');
    expect(context).toContain('Previous original text');
    expect(context).toContain('Translated:');
    expect(context).toContain('Previous translated text');
    expect(context).not.toContain('Wrong session original');
    expect(context).not.toContain('Wrong session translated');
  });

  it('returns an empty context when history is disabled or mode is not Select Element', async () => {
    const { getAIConversationHistoryEnabledAsync, TranslationMode } = await import('@/shared/config/config.js');

    getAIConversationHistoryEnabledAsync.mockResolvedValue(false);

    translationSessionManager.sessions.set('session-id', {
      id: 'session-id',
      provider: 'WebAI',
      history: [
        { role: 'user', content: 'Previous original text' },
        { role: 'assistant', content: 'Previous translated text' }
      ]
    });

    await expect(
      AIConversationHelper.formatCompactHistoryContext('session-id', TranslationMode.Select_Element)
    ).resolves.toBe('');

    getAIConversationHistoryEnabledAsync.mockResolvedValue(true);

    await expect(
      AIConversationHelper.formatCompactHistoryContext('session-id', TranslationMode.Field)
    ).resolves.toBe('');
  });

  describe('semantic prompt injection', () => {
    it('does not modify prompt when semanticHint is absent', async () => {
      const { getPromptBASEAIBatchAsync } = await import('@/shared/config/config.js');
      getPromptBASEAIBatchAsync.mockResolvedValue(
        'BATCH: translate from _{SOURCE} to _{TARGET}\n$_{PROMPT_INSTRUCTIONS}\n$_{TEXT}'
      );

      const { systemPrompt } = await AIConversationHelper.preparePromptAndText(
        ['Hello'],
        'en',
        'fa',
        'pdf-translation',
        'ai'
      );

      expect(systemPrompt).not.toContain('Additional translation context');
    });

    it('appends semantic instructions when semanticHint is present in PDF mode', async () => {
      const { getPromptBASEAIBatchAsync } = await import('@/shared/config/config.js');
      getPromptBASEAIBatchAsync.mockResolvedValue(
        'BATCH: translate from _{SOURCE} to _{TARGET}\n$_{PROMPT_INSTRUCTIONS}\n$_{TEXT}'
      );

      const metadata = {
        semanticHint: {
          hasSemanticContext: true,
          financialSubtypes: ['metric-with-delta'],
          hasStatementFragment: false,
          hasDashboardGroup: true
        }
      };

      const { systemPrompt } = await AIConversationHelper.preparePromptAndText(
        ['Hello'],
        'en',
        'fa',
        'pdf-translation',
        'ai',
        null,
        metadata
      );

      expect(systemPrompt).toContain('Additional translation context');
      expect(systemPrompt).toContain('Preserve all numeric values exactly');
      expect(systemPrompt).toContain('Maintain concise and parallel wording');
    });

    it('preserves user custom instructions before semantic instructions', async () => {
      const { getPromptAsync, getPromptBASEAIBatchAsync } = await import('@/shared/config/config.js');
      getPromptAsync.mockResolvedValue('Custom user rule: translate formally');
      getPromptBASEAIBatchAsync.mockResolvedValue(
        'BATCH: translate from _{SOURCE} to _{TARGET}\n$_{PROMPT_INSTRUCTIONS}\n$_{TEXT}'
      );

      const metadata = {
        semanticHint: {
          hasSemanticContext: true,
          hasDashboardGroup: true
        }
      };

      const { systemPrompt } = await AIConversationHelper.preparePromptAndText(
        ['Hello'],
        'en',
        'fa',
        'pdf-translation',
        'ai',
        null,
        metadata
      );

      const customIdx = systemPrompt.indexOf('Custom user rule');
      const semanticIdx = systemPrompt.indexOf('Additional translation context');
      expect(customIdx).toBeGreaterThan(-1);
      expect(semanticIdx).toBeGreaterThan(-1);
      expect(customIdx).toBeLessThan(semanticIdx);
    });

    it('does not inject semantic instructions for non-PDF mode', async () => {
      const { getPromptBASEAIBatchAsync } = await import('@/shared/config/config.js');
      getPromptBASEAIBatchAsync.mockResolvedValue(
        'BATCH: translate from _{SOURCE} to _{TARGET}\n$_{PROMPT_INSTRUCTIONS}\n$_{TEXT}'
      );

      const metadata = {
        semanticHint: {
          hasSemanticContext: true,
          financialSubtypes: ['metric-with-delta']
        }
      };

      const { systemPrompt } = await AIConversationHelper.preparePromptAndText(
        ['Hello'],
        'en',
        'fa',
        'select-element',
        'ai',
        null,
        metadata
      );

      expect(systemPrompt).not.toContain('Additional translation context');
    });

    it('ignores malformed semanticHint without crash', async () => {
      const { getPromptBASEAIBatchAsync } = await import('@/shared/config/config.js');
      getPromptBASEAIBatchAsync.mockResolvedValue(
        'BATCH: translate from _{SOURCE} to _{TARGET}\n$_{PROMPT_INSTRUCTIONS}\n$_{TEXT}'
      );

      const metadata = { semanticHint: 'invalid' };

      const { systemPrompt } = await AIConversationHelper.preparePromptAndText(
        ['Hello'],
        'en',
        'fa',
        'pdf-translation',
        'ai',
        null,
        metadata
      );

      expect(systemPrompt).not.toContain('Additional translation context');
    });

    it('ignores hint with hasSemanticContext false', async () => {
      const { getPromptBASEAIBatchAsync } = await import('@/shared/config/config.js');
      getPromptBASEAIBatchAsync.mockResolvedValue(
        'BATCH: translate from _{SOURCE} to _{TARGET}\n$_{PROMPT_INSTRUCTIONS}\n$_{TEXT}'
      );

      const metadata = {
        semanticHint: {
          hasSemanticContext: false,
          financialSubtypes: ['metric-with-delta']
        }
      };

      const { systemPrompt } = await AIConversationHelper.preparePromptAndText(
        ['Hello'],
        'en',
        'fa',
        'pdf-translation',
        'ai',
        null,
        metadata
      );

      expect(systemPrompt).not.toContain('Additional translation context');
    });
  });
});
