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

describe('AIConversationHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationSessionManager.sessions.clear();
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
});
