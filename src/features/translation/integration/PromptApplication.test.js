import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';
import { TranslationMode } from '@/shared/config/config.js';

describe('Prompt Application Runtime Audit', () => {
  let mockStorageData = {};

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockStorageData = {
      SOURCE_LANGUAGE: 'en',
      TARGET_LANGUAGE: 'fa',
      EXTENSION_ENABLED: true,
      TRANSLATE_ON_TEXT_FIELDS: true,
      TRANSLATE_WITH_SELECT_ELEMENT: true,
      ENABLE_DICTIONARY: true,
      BILINGUAL_TRANSLATION: true,
      BILINGUAL_TRANSLATION_MODES: {
          field: true,
          popup: true,
          selection: true,
          select_element: true
      },
      PROMPT_TEMPLATE: "Default $_{SOURCE} to $_{TARGET} $_{TEXT}",
      PROMPT_TEMPLATE_AUTO: "Default auto $_{TARGET} $_{TEXT}",
      PROMPT_BASE_FIELD: "Base $_{PROMPT_INSTRUCTIONS} $_{TEXT}",
      PROMPT_BASE_FIELD_AUTO: "Base auto $_{PROMPT_INSTRUCTIONS} $_{TEXT}",
      PROMPT_BASE_POPUP_TRANSLATE: "Popup $_{PROMPT_INSTRUCTIONS} $_{TEXT}",
      PROMPT_BASE_DICTIONARY: "Dict $_{SOURCE} $_{TARGET} $_{TEXT}",
      PROMPT_BASE_SCREEN_CAPTURE: "Capture $_{TARGET} $_{PROMPT_INSTRUCTIONS} $_{TEXT}",
      PROMPT_BASE_AI_BATCH: "Batch $_{PROMPT_INSTRUCTIONS} $_{TEXT}",
      PROMPT_SUBTITLE_USER: "Subtitle rules $_{SOURCE} $_{TARGET}",
      PROMPT_SUBTITLE_BASE: "Subtitle base $_{PROMPT_INSTRUCTIONS} $_{TEXT}"
    };

    browser.storage.local.get.mockImplementation(async (keys) => {
      if (!keys) return mockStorageData;
      if (typeof keys === 'string') return { [keys]: mockStorageData[keys] };
      if (Array.isArray(keys)) {
        const res = {};
        keys.forEach(k => res[k] = mockStorageData[k]);
        return res;
      }
      return { ...mockStorageData, ...keys };
    });
  });

  const testPromptApplication = async (promptKey, mode, sourceLang = 'en', targetLang = 'fa') => {
    const marker = `MARKER_${promptKey}`;
    
    // 1. Inject marker into storage
    if (promptKey === 'PROMPT_TEMPLATE' || promptKey === 'PROMPT_TEMPLATE_AUTO') {
        mockStorageData[promptKey] = `${marker} instructions $_{SOURCE} $_{TARGET} $_{TEXT}`;
    } else if (promptKey.includes('BASE')) {
        mockStorageData[promptKey] = `${marker} wrapper $_{PROMPT_INSTRUCTIONS} $_{TEXT}`;
        if (promptKey === 'PROMPT_BASE_DICTIONARY') {
            mockStorageData[promptKey] = `${marker} dict $_{SOURCE} $_{TARGET} $_{TEXT}`;
        }
    } else {
        mockStorageData[promptKey] = `${marker} custom $_{SOURCE} $_{TARGET}`;
    }

    // 2. Clear cache to force fresh load from mocked storage
    const { storageManager } = await import('@/shared/storage/core/StorageCore.js');
    storageManager.clearCache();

    // 3. Call runtime assembly
    const { AIConversationHelper } = await import('../providers/utils/AIConversationHelper.js');
    const { systemPrompt } = await AIConversationHelper.preparePromptAndText(
      "Sample text",
      sourceLang,
      targetLang,
      mode,
      'ai'
    );

    // 4. Assert marker exists in final assembled prompt
    expect(systemPrompt).toContain(marker);
    return systemPrompt;
  };

  it('applies PROMPT_TEMPLATE for Field mode', async () => {
    await testPromptApplication('PROMPT_TEMPLATE', TranslationMode.Field);
  });

  it('applies PROMPT_TEMPLATE_AUTO for Field mode when source is auto', async () => {
    await testPromptApplication('PROMPT_TEMPLATE_AUTO', TranslationMode.Field, 'auto');
  });

  it('applies PROMPT_BASE_FIELD for Field mode', async () => {
    await testPromptApplication('PROMPT_BASE_FIELD', TranslationMode.Field);
  });

  it('applies PROMPT_BASE_FIELD_AUTO for Field mode when source is auto', async () => {
    await testPromptApplication('PROMPT_BASE_FIELD_AUTO', TranslationMode.Field, 'auto');
  });

  it('applies PROMPT_BASE_POPUP_TRANSLATE for Popup mode', async () => {
    await testPromptApplication('PROMPT_BASE_POPUP_TRANSLATE', TranslationMode.Popup_Translate);
  });

  it('applies PROMPT_BASE_DICTIONARY for Dictionary mode', async () => {
    await testPromptApplication('PROMPT_BASE_DICTIONARY', TranslationMode.Dictionary_Translation);
  });

  it('applies PROMPT_SUBTITLE_USER and PROMPT_SUBTITLE_BASE for Subtitle mode', async () => {
    const userMarker = "MARKER_SUBTITLE_USER";
    const baseMarker = "MARKER_SUBTITLE_BASE";
    
    mockStorageData.PROMPT_SUBTITLE_USER = `${userMarker} rules $_{SOURCE} $_{TARGET}`;
    mockStorageData.PROMPT_SUBTITLE_BASE = `${baseMarker} wrapper $_{PROMPT_INSTRUCTIONS} $_{TEXT}`;

    const { storageManager } = await import('@/shared/storage/core/StorageCore.js');
    const { 
        getPromptSubtitleBaseAsync, 
        getPromptSubtitleUserAsync,
        getPromptSubtitleBatchAsync 
    } = await import('@/shared/config/config.js');
    
    storageManager.clearCache();

    // 1. Coordinator fetches prompts
    const [promptTemplate, promptUser, promptBatch] = await Promise.all([
        getPromptSubtitleBaseAsync(),
        getPromptSubtitleUserAsync(),
        getPromptSubtitleBatchAsync()
    ]);

    // 2. Coordinator assembles metadata for the translation request
    const metadata = {
        promptTemplate,
        instruction: promptUser,
        batchInstruction: promptBatch
    };

    const { AIConversationHelper } = await import('../providers/utils/AIConversationHelper.js');
    
    // 3. Provider/Helper assembles final prompt
    const { systemPrompt } = await AIConversationHelper.preparePromptAndText(
      [{ i: 1, text: "Hello" }],
      'en',
      'fa',
      TranslationMode.Subtitle,
      'ai',
      null,
      metadata
    );

    expect(systemPrompt).toContain(baseMarker);
    expect(systemPrompt).toContain(userMarker);
  });

  it('applies PROMPT_BASE_SCREEN_CAPTURE even if locked in UI', async () => {
    await testPromptApplication('PROMPT_BASE_SCREEN_CAPTURE', TranslationMode.ScreenCapture);
  });

  it('regression: saved prompt edits are reflected in runtime getters', async () => {
    const { storageManager } = await import('@/shared/storage/core/StorageCore.js');
    const { getPromptAsync } = await import('@/shared/config/config.js');
    
    mockStorageData.PROMPT_TEMPLATE = "EDITED_VALUE $_{TEXT}";
    storageManager.clearCache();
    const val = await getPromptAsync();
    expect(val).toBe("EDITED_VALUE $_{TEXT}");
    
    mockStorageData.PROMPT_TEMPLATE = "NEW_EDIT $_{TEXT}";
    storageManager.clearCache();
    const val2 = await getPromptAsync();
    expect(val2).toBe("NEW_EDIT $_{TEXT}");
  });
});
