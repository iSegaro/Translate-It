import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { getActivePinia, createPinia, setActivePinia, defineStore } from 'pinia';
import { useUnifiedTranslation } from './useUnifiedTranslation.js';

// --- Mocks ---

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  },
}));

vi.mock("@/shared/logging/logger.js", () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Create real stores for the test to ensure reactivity
const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: {
      ENABLE_DICTIONARY: true,
      TRANSLATION_API: "google_v2",
    }
  })
});

const useTranslationStore = defineStore('translation', {
  state: () => ({
    uiTargetLanguage: "fa",
    currentTranslation: null,
  })
});

vi.mock("@/features/settings/stores/settings.js", () => ({
  useSettingsStore: () => useSettingsStore()
}));

vi.mock("@/features/translation/stores/translation.js", () => ({
  useTranslationStore: () => useTranslationStore()
}));

vi.mock("@/composables/core/useBrowserAPI.js", () => ({
  useBrowserAPI: vi.fn(() => ({
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  })),
}));

vi.mock("@/shared/messaging/core/UnifiedMessaging.js", () => ({
  sendMessage: vi.fn(),
}));

const mockErrorManager = {
  errorMessage: ref(""),
  errorType: ref(null),
  hasError: ref(false),
  canRetry: ref(false),
  canOpenSettings: ref(false),
  handleError: vi.fn(),
  clearError: vi.fn(),
  getRetryCallback: vi.fn(),
  getSettingsCallback: vi.fn(),
};

vi.mock("@/features/translation/composables/useTranslationError.js", () => ({
  useTranslationError: vi.fn(() => mockErrorManager),
}));

vi.mock("@/utils/messaging/messageId.js", () => ({
  generateMessageId: vi.fn(() => "test-msg-id"),
}));

vi.mock("@/shared/config/config.js", () => ({
  CONFIG: {
    POPUP_MAX_CHARS: 5000,
    SIDEPANEL_MAX_CHARS: 10000,
    SELECTION_MAX_CHARS: 5000,
    SELECT_ELEMENT_MAX_CHARS: 300000,
  },
  getSourceLanguageAsync: vi.fn().mockResolvedValue("auto"),
  getTargetLanguageAsync: vi.fn().mockResolvedValue("en"),
  getPopupMaxCharsAsync: vi.fn().mockResolvedValue(5000),
  getSidepanelMaxCharsAsync: vi.fn().mockResolvedValue(10000),
  getSourceLanguage: vi.fn().mockReturnValue("auto"),
  getTargetLanguage: vi.fn().mockReturnValue("en"),
  TranslationMode: {
    Popup_Translate: "popup_translate",
    Sidepanel_Translate: "sidepanel_translate",
    Dictionary_Translation: "dictionary_translation",
  },
}));

vi.mock("@/shared/config/constants.js", () => ({
  AUTO_DETECT_VALUE: "auto",
  DEFAULT_TARGET_LANGUAGE: "fa",
}));

vi.mock("@/utils/UtilsFactory.js", () => ({
  utilsFactory: {
    getI18nUtils: vi.fn().mockResolvedValue({
      findLanguageCode: vi.fn((lang) => Promise.resolve(lang)),
    }),
  },
}));

function withSetup(composable) {
  let result;
  const app = createApp({
    setup() {
      result = composable();
      return () => {};
    },
  });
  app.use(getActivePinia());
  const host = document.createElement("div");
  app.mount(host);
  return [result, app];
}

describe("useUnifiedTranslation", () => {
  let translationStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    translationStore = useTranslationStore();
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should initialize with default values", async () => {
    const [composable] = withSetup(() => useUnifiedTranslation("popup"));
    await nextTick();
    await vi.runAllTimersAsync();
    expect(composable.sourceText.value).toBe("");
    expect(composable.translatedText.value).toBe("");
  });

  it("should trigger translation and handle success", async () => {
    const [composable] = withSetup(() => useUnifiedTranslation("popup"));
    const { sendMessage } = await import("@/shared/messaging/core/UnifiedMessaging.js");
    
    sendMessage.mockResolvedValue({
      success: true,
      translatedText: "سلام دنیا",
      sourceLanguage: "en",
      targetLanguage: "fa",
    });

    composable.sourceText.value = "Hello world";
    const resultPromise = composable.triggerTranslation();
    expect(composable.isTranslating.value).toBe(true);
    
    await resultPromise;
    expect(composable.translatedText.value).toBe("سلام دنیا");
    expect(composable.isTranslating.value).toBe(false);
  });

  it("should handle translation error", async () => {
    const [composable] = withSetup(() => useUnifiedTranslation("popup"));
    const { sendMessage } = await import("@/shared/messaging/core/UnifiedMessaging.js");
    sendMessage.mockRejectedValue(new Error("Network error"));

    composable.sourceText.value = "Error test";
    await composable.triggerTranslation();

    expect(composable.isTranslating.value).toBe(false);
    expect(mockErrorManager.handleError).toHaveBeenCalled();
  });

  it("should clear translation", async () => {
    const [composable] = withSetup(() => useUnifiedTranslation("popup"));
    composable.sourceText.value = "Some text";
    composable.translatedText.value = "Some translation";
    await composable.clearTranslation();
    expect(composable.sourceText.value).toBe("");
    expect(composable.translatedText.value).toBe("");
  });

  it("should update when translationStore.currentTranslation changes", async () => {
    const [composable] = withSetup(() => useUnifiedTranslation("popup"));
    
    const newTranslation = {
      sourceText: "Store source",
      translatedText: "Store translation",
      sourceLanguage: "en",
      targetLanguage: "fa"
    };

    translationStore.currentTranslation = newTranslation;
    
    // Use a loop to wait for the value to change, as it's async
    let attempts = 0;
    while (composable.sourceText.value === "" && attempts < 10) {
      await nextTick();
      await vi.runAllTimersAsync();
      attempts++;
    }

    expect(composable.sourceText.value).toBe("Store source");
    expect(composable.translatedText.value).toBe("Store translation");
  });

  it("should handle minimum loading duration in sidepanel", async () => {
    const [composable] = withSetup(() => useUnifiedTranslation("sidepanel"));
    const { sendMessage } = await import("@/shared/messaging/core/UnifiedMessaging.js");
    
    sendMessage.mockResolvedValue({ success: true, translatedText: "Result" });
    composable.sourceText.value = "Sidepanel test";

    const triggerPromise = composable.triggerTranslation();
    
    vi.advanceTimersByTime(50);
    expect(composable.isTranslating.value).toBe(true);
    
    vi.advanceTimersByTime(100);
    await triggerPromise;
    expect(composable.isTranslating.value).toBe(false);
  });
});
