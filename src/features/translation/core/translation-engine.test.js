import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock extension polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

// 2. Mock providers and managers as factory functions that Vitest recognizes as constructors
vi.mock("@/features/translation/providers/ProviderFactory.js", () => {
  return {
    ProviderFactory: function() {
      this.getProvider = vi.fn().mockResolvedValue({
        providerName: 'TestProvider',
        constructor: { isAI: true, supportsDictionary: true },
        translate: vi.fn().mockResolvedValue({
          translatedText: 'Translated Result',
          detectedLanguage: 'en',
          targetLanguage: 'fa'
        })
      });
    }
  };
});

vi.mock("./managers/TranslationLifecycleRegistry.js", () => {
  return {
    TranslationLifecycleRegistry: function() {
      this.registerRequest = vi.fn();
      this.unregisterRequest = vi.fn();
      this.getAbortController = vi.fn();
    }
  };
});

vi.mock("./managers/TranslationHistoryManager.js", () => {
  return {
    TranslationHistoryManager: function() {
      this.addToHistory = vi.fn();
      this.loadHistoryFromStorage = vi.fn();
    }
  };
});

vi.mock("./managers/OptimizedJsonHandler.js", () => {
  return {
    OptimizedJsonHandler: function() {
      this.execute = vi.fn();
    }
  };
});

// 3. Imports
import { TranslationEngine } from './translation-engine.js';
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";

// 4. Other dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock("@/shared/config/config.js", () => ({
  CONFIG: {
    SELECTION_MAX_CHARS: 5000,
    POPUP_MAX_CHARS: 5000,
    SIDEPANEL_MAX_CHARS: 10000,
    SELECT_ELEMENT_MAX_CHARS: 300000,
  },
  getSourceLanguageAsync: vi.fn(() => Promise.resolve('auto')),
  getTargetLanguageAsync: vi.fn(() => Promise.resolve('fa')),
  getPopupMaxCharsAsync: vi.fn(() => Promise.resolve(5000)),
  getSidepanelMaxCharsAsync: vi.fn(() => Promise.resolve(10000)),
  getSelectionMaxCharsAsync: vi.fn(() => Promise.resolve(5000)),
  getSelectElementMaxCharsAsync: vi.fn(() => Promise.resolve(300000)),
  TranslationMode: { Selection: 'selection', Page: 'page', Dictionary_Translation: 'dictionary', Select_Element: 'select_element' }
}));

// Mock ErrorMatcher using central mock
vi.mock('@/shared/error-management/ErrorMatcher.js');

describe('TranslationEngine', () => {
  let engine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new TranslationEngine();
  });

  describe('handleMessage', () => {
    it('should process TRANSLATE message successfully', async () => {
      const request = {
        action: MessageActions.TRANSLATE,
        messageId: 'test-123',
        data: {
          text: 'Hello',
          provider: 'google',
          sourceLanguage: 'en',
          targetLanguage: 'fa'
        }
      };

      const result = await engine.handleMessage(request, {});

      expect(result.success).toBe(true);
      expect(result.translatedText).toBe('Translated Result');
    });

    it('should handle errors and return formatted error response', async () => {
      const mockProvider = await engine.getProvider('google');
      mockProvider.translate.mockRejectedValue(new Error('API Down'));

      const request = {
        action: MessageActions.TRANSLATE,
        data: { text: 'Test', provider: 'google' }
      };

      const result = await engine.handleMessage(request, {});

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('API Down');
    });
  });

  describe('Validation Logic', () => {
    it('should block extremely long texts in regular modes', async () => {
      const longText = 'a'.repeat(60000);
      const request = {
        action: MessageActions.TRANSLATE,
        data: { text: longText, provider: 'google', mode: 'selection' }
      };

      const result = await engine.handleMessage(request, {});

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Text too long');
    });
  });

  describe('Mode Resolution', () => {
    it('should downgrade dictionary mode if provider does not support it', async () => {
      const mockProvider = await engine.getProvider('google');
      mockProvider.constructor.supportsDictionary = false;

      const data = { text: 'word', mode: 'dictionary' };
      const resolvedMode = engine._resolveTranslationMode(data, mockProvider.constructor);

      expect(resolvedMode).toBe('selection');
    });
  });
});
