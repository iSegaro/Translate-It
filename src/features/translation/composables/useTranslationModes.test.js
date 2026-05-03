import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp } from 'vue';
import { useSidepanelTranslation, useSelectElementTranslation, useSidepanelActions } from './useTranslationModes.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

// --- Mocks ---

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      onActivated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      query: vi.fn().mockResolvedValue([{ id: 1 }]),
    }
  },
}));

vi.mock("@/shared/logging/logger.js", () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
  })),
}));

vi.mock("@/utils/messaging/messageId.js", () => ({
  generateMessageId: vi.fn(() => "test-msg-id"),
}));

vi.mock("@/shared/config/config.js", () => ({
  getSettingsAsync: vi.fn().mockResolvedValue({
    ENABLE_DICTIONARY: true,
    TRANSLATION_API: "google_v2",
  }),
  TranslationMode: {
    Sidepanel_Translate: "sidepanel_translate",
    Dictionary_Translation: "dictionary_translation",
  },
}));

vi.mock("@/composables/shared/useLanguages.js", () => ({
  useLanguages: vi.fn(() => ({
    getLanguagePromptName: vi.fn((lang) => lang),
  })),
}));

const sendMessageViaMessagingMock = vi.fn();
vi.mock("@/shared/messaging/composables/useMessaging.js", () => ({
  useMessaging: vi.fn(() => ({
    sendMessage: sendMessageViaMessagingMock,
    createMessage: vi.fn((action) => ({ action })),
    MessageActions: MessageActions
  })),
}));

vi.mock("@/shared/messaging/core/UnifiedMessaging.js", () => ({
  sendMessage: vi.fn(),
}));

vi.mock("@/shared/messaging/core/MessageHandler.js", () => ({
  createMessageHandler: vi.fn(() => ({
    registerHandler: vi.fn(),
    unregisterHandler: vi.fn(),
    listen: vi.fn(),
    isListenerActive: false,
  })),
}));

vi.mock("@/shared/error-management/ErrorMatcher.js");
vi.mock("@/shared/error-management/ErrorTypes.js");

vi.mock("@/shared/utils/text/textAnalysis.js", () => ({
  isSingleWordOrShortPhrase: vi.fn().mockReturnValue(false),
}));

// Helper to test composables
function withSetup(composable) {
  let result;
  const app = createApp({
    setup() {
      result = composable();
      return () => {};
    },
  });
  app.mount(document.createElement("div"));
  return [result, app];
}

describe("useTranslationModes", () => {
  
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useSidepanelTranslation", () => {
    it("should initialize with default values", () => {
      const [composable] = withSetup(() => useSidepanelTranslation());
      expect(composable.isLoading.value).toBe(false);
      expect(composable.result.value).toBeNull();
      expect(composable.error.value).toBeNull();
    });

    it("should translate text successfully", async () => {
      const [composable] = withSetup(() => useSidepanelTranslation());
      const { sendMessage } = await import("@/shared/messaging/core/UnifiedMessaging.js");
      
      const mockResponse = { success: true, translatedText: "سلام" };
      sendMessage.mockResolvedValue(mockResponse);

      const result = await composable.translateText("Hello", "en", "fa");

      expect(composable.isLoading.value).toBe(false);
      expect(composable.result.value).toEqual(mockResponse);
      expect(result).toEqual(mockResponse);
      expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        action: MessageActions.TRANSLATE,
        data: expect.objectContaining({
          text: "Hello",
          targetLanguage: "fa"
        })
      }));
    });

    it("should handle translation error response", async () => {
      const [composable] = withSetup(() => useSidepanelTranslation());
      const { sendMessage } = await import("@/shared/messaging/core/UnifiedMessaging.js");
      
      sendMessage.mockResolvedValue({ success: false, error: "API Error" });

      await composable.translateText("Hello", "en", "fa");

      expect(composable.error.value).toBe("API Error");
      expect(composable.result.value).toBeNull();
    });

    it("should clear state", () => {
      const [composable] = withSetup(() => useSidepanelTranslation());
      composable.error.value = "Error";
      composable.result.value = {};
      
      composable.clearState();
      
      expect(composable.error.value).toBeNull();
      expect(composable.result.value).toBeNull();
    });
  });

  describe("useSelectElementTranslation", () => {
    it("should initialize and register listener on mount", async () => {
      const [composable] = withSetup(() => useSelectElementTranslation());
      
      // onMounted is called during withSetup's app.mount
      expect(composable.isSelectModeActive.value).toBe(false);
    });

    it("should activate select mode successfully", async () => {
      const [composable] = withSetup(() => useSelectElementTranslation());
      const { sendMessage } = await import("@/shared/messaging/core/UnifiedMessaging.js");
      
      sendMessage.mockResolvedValue({ success: true });

      const success = await composable.activateSelectMode({ provider: 'google' });

      expect(success).toBe(true);
      expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
        data: expect.objectContaining({ provider: 'google' })
      }));
    });

    it("should handle activation failure", async () => {
      const [composable] = withSetup(() => useSelectElementTranslation());
      const { sendMessage } = await import("@/shared/messaging/core/UnifiedMessaging.js");
      
      sendMessage.mockResolvedValue({ success: false, message: "Restricted page" });

      const success = await composable.activateSelectMode();

      expect(success).toBe(false);
      expect(composable.error.value).toBe("Restricted page");
    });

    it("should toggle select element mode optimistically", async () => {
      const [composable] = withSetup(() => useSelectElementTranslation());
      const { sendMessage } = await import("@/shared/messaging/core/UnifiedMessaging.js");
      
      sendMessage.mockResolvedValue({ success: true });
      
      // Start as false
      composable.isSelectModeActive.value = false;
      
      const promise = composable.toggleSelectElement();
      
      // Should be true immediately (optimistic)
      expect(composable.isSelectModeActive.value).toBe(true);
      
      await promise;
      expect(composable.isSelectModeActive.value).toBe(true);
    });
  });

  describe("useSidepanelActions", () => {
    it("should revert translation successfully", async () => {
      const [composable] = withSetup(() => useSidepanelActions());
      
      sendMessageViaMessagingMock.mockResolvedValue({ success: true, revertedCount: 5 });

      const success = await composable.revertTranslation();

      expect(success).toBe(true);
      expect(sendMessageViaMessagingMock).toHaveBeenCalledWith(expect.objectContaining({
        action: MessageActions.REVERT_SELECT_ELEMENT_MODE
      }));
    });

    it("should stop TTS", async () => {
      const [composable] = withSetup(() => useSidepanelActions());
      const { sendMessage } = await import("@/shared/messaging/core/UnifiedMessaging.js");
      
      await composable.stopTTS();

      expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        action: MessageActions.TTS_STOP
      }));
    });
  });
});
