import { describe, it, expect, vi, afterEach } from 'vitest';
import { MockProvider } from './MockProvider.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';
import { TranslationCallPurpose } from './ProviderConstants.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
    operation: vi.fn(),
    performance: vi.fn(),
  }),
}));

describe('MockProvider dictionary samples', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards call purpose to its mock request without payload metadata', async () => {
    vi.useFakeTimers();
    const provider = new MockProvider();
    const executeRequest = vi.spyOn(provider, '_executeRequest').mockResolvedValue(undefined);
    const promise = provider._callAI('system', 'text', { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
    await vi.runAllTimersAsync();
    await promise;
    expect(executeRequest).toHaveBeenCalledWith(expect.objectContaining({
      callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY
    }));
  });

  it('returns the English pronunciation dictionary sample for Expression', () => {
    expect(MockProvider.getDictionaryMockSample('Expression')).toBe(
      [
        'Expression',
        '',
        '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
        '',
        '- **Noun**: Expression, phrase, wording',
        '- **Synonyms**: Phrase, wording, statement',
      ].join('\n'),
    );
  });

  it('returns the English pronunciation dictionary sample when the prompt includes the target word after the translate prefix', () => {
    expect(
      MockProvider.getDictionaryMockSample('Now, please translate:\nExpression'),
    ).toBe(
      [
        'Expression',
        '',
        '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
        '',
        '- **Noun**: Expression, phrase, wording',
        '- **Synonyms**: Phrase, wording, statement',
      ].join('\n'),
    );
  });

  it('returns the Chinese pronunciation dictionary sample for 表达方式', () => {
    expect(MockProvider.getDictionaryMockSample('表达方式')).toBe(
      [
        '表达方式',
        '',
        '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
        '',
        '- **名词**: 表达方式, 词语, 表情, 算式',
        '- **同义词**: 词汇, 措辞, 呈现',
      ].join('\n'),
    );
  });

  it('returns the Chinese pronunciation dictionary sample when the prompt includes the target word after the translate prefix', () => {
    expect(
      MockProvider.getDictionaryMockSample('Now, please translate:\n表达方式'),
    ).toBe(
      [
        '表达方式',
        '',
        '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
        '',
        '- **名词**: 表达方式, 词语, 表情, 算式',
        '- **同义词**: 词汇, 措辞, 呈现',
      ].join('\n'),
    );
  });

  it('uses the effective prompt text when userText is empty in the runtime path', async () => {
    vi.useFakeTimers();

    const provider = new MockProvider();
    provider._executeRequest = vi.fn().mockResolvedValue(undefined);

    const responsePromise = provider._callAI(
      'Now, please translate:\nExpression',
      '',
      {
        expectedFormat: ResponseFormat.STRING,
      },
    );

    await vi.runAllTimersAsync();

    await expect(responsePromise).resolves.toBe(
      [
        'Expression',
        '',
        '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
        '',
        '- **Noun**: Expression, phrase, wording',
        '- **Synonyms**: Phrase, wording, statement',
      ].join('\n'),
    );
  });

  it('returns null for unrelated text', () => {
    expect(MockProvider.getDictionaryMockSample('Hello world')).toBeNull();
  });
});
