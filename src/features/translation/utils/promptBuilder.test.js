import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/config/config.js', () => ({
  getPromptAsync: vi.fn(),
  getPromptAutoAsync: vi.fn(),
  getPromptBASESelectAsync: vi.fn(),
  getPromptPopupTranslateAsync: vi.fn(),
  getPromptBASEFieldAsync: vi.fn(),
  getPromptBASEFieldAutoAsync: vi.fn(),
  getEnableDictionaryAsync: vi.fn().mockResolvedValue(false),
  getPromptDictionaryAsync: vi.fn(),
  getPromptBASEBatchAsync: vi.fn(),
  getPromptBASEAIBatchAsync: vi.fn(),
  getPromptBASEAIBatchAutoAsync: vi.fn(),
  getPromptBASEScreenCaptureAsync: vi.fn(),
  getSourceLanguageAsync: vi.fn().mockResolvedValue('auto'),
  TranslationMode: {
    Field: 'content',
    Select_Element: 'select-element',
    Popup_Translate: 'popup',
    Sidepanel_Translate: 'sidepanel',
    Dictionary_Translation: 'dictionary',
    ScreenCapture: 'screen-capture',
    PDF: 'pdf-translation',
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

import { buildPrompt } from './promptBuilder.js';

describe('buildPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the non-auto prompt when bilingual auto prompts are disabled', async () => {
    const { getPromptAsync, getPromptAutoAsync, getPromptBASEFieldAsync, getPromptBASEFieldAutoAsync } = await import('@/shared/config/config.js');

    getPromptAsync.mockResolvedValue('INSTRUCTIONS: translate from $_{SOURCE} to $_{TARGET}');
    getPromptAutoAsync.mockResolvedValue('INSTRUCTIONS_AUTO: translate into $_{TARGET}');
    getPromptBASEFieldAsync.mockResolvedValue('BASE: $_{PROMPT_INSTRUCTIONS}\n$_{TEXT}');
    getPromptBASEFieldAutoAsync.mockResolvedValue('BASE_AUTO: $_{PROMPT_INSTRUCTIONS}\n$_{TEXT}');

    const prompt = await buildPrompt('Hello', 'auto', 'fa', 'content', 'ai');

    expect(getPromptAsync).toHaveBeenCalled();
    expect(getPromptAutoAsync).not.toHaveBeenCalled();
    expect(getPromptBASEFieldAsync).toHaveBeenCalled();
    expect(getPromptBASEFieldAutoAsync).not.toHaveBeenCalled();
    expect(prompt).toContain('BASE: INSTRUCTIONS: translate from English to Persian');
    expect(prompt).not.toContain('BASE_AUTO');
  });

  it('uses the auto prompt when bilingual auto prompts are enabled', async () => {
    const { getPromptAsync, getPromptAutoAsync, getPromptBASEFieldAsync, getPromptBASEFieldAutoAsync } = await import('@/shared/config/config.js');
    const { shouldUseAutoPromptAsync } = await import('@/features/translation/utils/bilingualPromptHelper.js');

    shouldUseAutoPromptAsync.mockResolvedValue(true);
    getPromptAsync.mockResolvedValue('INSTRUCTIONS: translate from $_{SOURCE} to $_{TARGET}');
    getPromptAutoAsync.mockResolvedValue('INSTRUCTIONS_AUTO: translate into $_{TARGET}');
    getPromptBASEFieldAsync.mockResolvedValue('BASE: $_{PROMPT_INSTRUCTIONS}\n$_{TEXT}');
    getPromptBASEFieldAutoAsync.mockResolvedValue('BASE_AUTO: $_{PROMPT_INSTRUCTIONS}\n$_{TEXT}');

    const prompt = await buildPrompt('Hello', 'auto', 'fa', 'content', 'ai');

    expect(getPromptAsync).not.toHaveBeenCalled();
    expect(getPromptAutoAsync).toHaveBeenCalled();
    expect(getPromptBASEFieldAsync).not.toHaveBeenCalled();
    expect(getPromptBASEFieldAutoAsync).toHaveBeenCalled();
    expect(prompt).toContain('BASE_AUTO: INSTRUCTIONS_AUTO: translate into Persian');
    expect(prompt).not.toContain('BASE:');
  });

});
