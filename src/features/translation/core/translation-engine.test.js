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
      this.getCancellationReason = vi.fn(() => null);
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
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getEnableDictionaryAsync } from "@/shared/config/config.js";

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
  getEnableDictionaryAsync: vi.fn(() => Promise.resolve(true)),
  getPopupMaxCharsAsync: vi.fn(() => Promise.resolve(5000)),
  getSidepanelMaxCharsAsync: vi.fn(() => Promise.resolve(10000)),
  getSelectionMaxCharsAsync: vi.fn(() => Promise.resolve(5000)),
  getSelectElementMaxCharsAsync: vi.fn(() => Promise.resolve(300000)),
  TranslationMode: { 
    Selection: 'selection', 
    Page: 'page', 
    Dictionary_Translation: 'dictionary', 
    Select_Element: 'select_element',
    PDF: 'pdf-translation',
    MouseHover: 'mouse_hover',
    Field: 'field',
    Popup_Translate: 'popup'
  }
}));

vi.mock("@/shared/utils/text/textAnalysis.js", () => ({
  isSingleWordOrShortPhrase: vi.fn((text) => text && text.trim().split(/\s+/).length === 1)
}));

// Mock ErrorMatcher using central mock
vi.mock('@/shared/error-management/ErrorMatcher.js');

describe('TranslationEngine', () => {
  let engine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new TranslationEngine();
    // Reset default mock behaviors
    getEnableDictionaryAsync.mockResolvedValue(true);
  });

  describe('scalar empty input validation', () => {
    it.each(['', ' ', '\n', '\t', ' \n\t '])('returns TEXT_EMPTY for %j', async (text) => {
      const response = await engine.handleMessage({
        action: MessageActions.TRANSLATE,
        messageId: `empty-${JSON.stringify(text)}`,
        data: {
          text,
          provider: 'google',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          mode: 'selection',
        },
      }, {});

      expect(response.error.type).toBe(ErrorTypes.TEXT_EMPTY);
      expect(engine.factory.getProvider).not.toHaveBeenCalled();
    });

    it('keeps non-empty scalar input on the provider path', async () => {
      const provider = await engine.getProvider('google');

      const result = await engine.executeTranslation({
        text: 'Hello',
        provider: 'google',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        mode: 'selection',
      }, {});

      expect(result.success).toBe(true);
      expect(provider.translate).toHaveBeenCalled();
    });

    it.each([null, undefined, [], {}])('does not reclassify %j as TEXT_EMPTY', async (text) => {
      const response = await engine.handleMessage({
        action: MessageActions.TRANSLATE,
        messageId: `non-scalar-${String(text)}`,
        data: {
          text,
          provider: 'google',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          mode: 'selection',
        },
      }, {});

      expect(response.error.type).not.toBe(ErrorTypes.TEXT_EMPTY);
    });

    it('preserves non-empty structured input behavior', async () => {
      getEnableDictionaryAsync.mockResolvedValue(false);
      engine.jsonHandler.execute.mockResolvedValue({
        success: true,
        translatedText: ['translated'],
      });

      const result = await engine.handleMessage({
        action: MessageActions.TRANSLATE,
        messageId: 'structured-non-empty',
        data: {
          text: [''],
          provider: 'google',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          mode: 'select_element',
          options: { rawJsonPayload: true },
        },
      }, {});

      expect(result.success).toBe(true);
      expect(engine.jsonHandler.execute).toHaveBeenCalled();
    });
  });

  it('forwards timeout classification and reason to lifecycle', async () => {
    engine.lifecycleRegistry.cancelTranslation = vi.fn().mockResolvedValue(true);

    await engine.cancelTranslation(
      'message-id',
      true,
      'PROGRESS_TIMEOUT',
      'Streaming translation timed out'
    );

    expect(engine.lifecycleRegistry.cancelTranslation).toHaveBeenCalledWith(
      'message-id',
      true,
      'PROGRESS_TIMEOUT',
      'Streaming translation timed out'
    );
  });

  it('formatError for a timeout yields a terminal response without streaming marker', () => {
    const timeoutError = new Error('Batch translation timed out after 300000ms');
    timeoutError.type = ErrorTypes.TRANSLATION_TIMEOUT;

    const result = engine.formatError(timeoutError, 'select-element');

    expect(result.success).toBe(false);
    expect(result.error.type).toBe(ErrorTypes.TRANSLATION_TIMEOUT);
    expect(result.error.message).toBe('Batch translation timed out after 300000ms');
    // The timeout response must not claim active streaming: the coordinator
    // routes on `response.streaming` truthiness, and a timeout returns the
    // error response directly instead of awaiting a stream that never ends.
    expect('streaming' in result).toBe(false);
  });

  it('formatError preserves canonical provider identity and visible fields', () => {
    const providerError = new Error('Unknown model name');
    Object.assign(providerError, {
      type: ErrorTypes.HTTP_ERROR,
      originalType: ErrorTypes.MODEL_MISSING,
      statusCode: 400,
      context: 'provider-request',
      providerName: 'WebAI',
    });

    const result = engine.formatError(providerError, 'popup');

    expect(result).toEqual({
      success: false,
      error: {
        message: 'Unknown model name',
        type: ErrorTypes.HTTP_ERROR,
        originalType: ErrorTypes.MODEL_MISSING,
        statusCode: 400,
        context: 'provider-request',
        providerName: 'WebAI',
      },
    });
  });

  it('preserves canonical fields when reconstructing resolved provider failures', async () => {
    const mockProvider = await engine.getProvider('google');
    mockProvider.translate.mockResolvedValue({
      success: false,
      error: {
        message: 'Unknown model name',
        type: ErrorTypes.HTTP_ERROR,
        originalType: ErrorTypes.MODEL_MISSING,
        statusCode: 400,
        providerName: 'WebAI',
      },
    });

    let caughtError;
    try {
      await engine.executeTranslation({
        text: 'Hello',
        provider: 'google',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        mode: 'selection',
      }, {});
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      message: 'Unknown model name',
      type: ErrorTypes.HTTP_ERROR,
      originalType: ErrorTypes.MODEL_MISSING,
      statusCode: 400,
      providerName: 'WebAI',
    });
  });

  it('prefers errorDetails over conflicting legacy error', async () => {
    const mockProvider = await engine.getProvider('google');
    mockProvider.translate.mockResolvedValue({
      success: false,
      error: { message: 'legacy failure', type: 'LEGACY_ERROR' },
      errorDetails: {
        message: 'canonical failure',
        type: ErrorTypes.HTTP_ERROR,
        originalType: ErrorTypes.MODEL_MISSING,
        statusCode: 503,
        context: 'provider-request',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
      },
    });

    await expect(engine.executeTranslation({
      text: 'Hello',
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: 'selection',
    }, {})).rejects.toMatchObject({
      message: 'canonical failure',
      type: ErrorTypes.HTTP_ERROR,
      originalType: ErrorTypes.MODEL_MISSING,
      statusCode: 503,
      context: 'provider-request',
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'UPSTREAM_FAILURE',
      errorCode: 'E_UPSTREAM',
      translationOutcome: { partial: true },
    });
  });

  it('preserves canonical identity for errorDetails-only failures', async () => {
    const mockProvider = await engine.getProvider('google');
    mockProvider.translate.mockResolvedValue({
      success: false,
      errorDetails: {
        message: 'API key invalid',
        type: ErrorTypes.API_KEY_INVALID,
        statusCode: 401,
        providerName: 'Provider',
      },
    });

    await expect(engine.executeTranslation({
      text: 'Hello',
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: 'selection',
    }, {})).rejects.toMatchObject({
      message: 'API key invalid',
      type: ErrorTypes.API_KEY_INVALID,
      statusCode: 401,
      providerName: 'Provider',
    });
  });

  it('falls back to legacy error when errorDetails is malformed', async () => {
    const mockProvider = await engine.getProvider('google');
    mockProvider.translate.mockResolvedValue({
      success: false,
      error: {
        message: 'legacy failure',
        type: ErrorTypes.NETWORK_ERROR,
        statusCode: 502,
      },
      errorDetails: { arbitrary: true },
    });

    await expect(engine.executeTranslation({
      text: 'Hello',
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: 'selection',
    }, {})).rejects.toMatchObject({
      message: 'legacy failure',
      type: ErrorTypes.NETWORK_ERROR,
      statusCode: 502,
    });
  });

  it('keeps whole-result fallback for failure envelopes without error fields', async () => {
    const mockProvider = await engine.getProvider('google');
    mockProvider.translate.mockResolvedValue({
      success: false,
      type: ErrorTypes.VALIDATION,
      message: 'invalid provider result',
    });

    await expect(engine.executeTranslation({
      text: 'Hello',
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: 'selection',
    }, {})).rejects.toMatchObject({
      message: 'invalid provider result',
      type: ErrorTypes.VALIDATION,
    });
  });

  describe('handleMessage', () => {
    it('should process TRANSLATE message successfully', async () => {
      const request = {
        action: MessageActions.TRANSLATE,
        messageId: 'test-123',
        data: {
          text: 'Hello world',
          provider: 'google',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          mode: 'selection'
        }
      };

      const result = await engine.handleMessage(request, {});

      expect(result.success).toBe(true);
      expect(result.translatedText).toBe('Translated Result');
      expect(result.mode).toBe('selection'); // Not upgraded because multi-word
    });

    it.each([
      ['document-replaced', {
        success: false,
        cancelled: true,
        error: {
          operationAborted: true,
          cancellationReason: 'document-replaced',
        },
      }],
      ['user-cancelled', {
        success: false,
        cancelled: true,
        error: { type: ErrorTypes.USER_CANCELLED },
      }],
      ['timeout', {
        success: false,
        timedOut: true,
        error: { type: ErrorTypes.TRANSLATION_TIMEOUT },
      }],
    ])('returns %s lifecycle result without starting translation', async (reason, expectedResult) => {
      engine.lifecycleRegistry.registerRequest.mockReturnValue(null);
      engine.lifecycleRegistry.getCancellationReason.mockReturnValue(reason);
      const executeTranslation = vi.spyOn(engine, 'executeTranslation');
      const request = {
        action: MessageActions.TRANSLATE,
        messageId: 'pre-cancelled',
        data: {
          text: 'Hello world',
          provider: 'google',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          mode: 'selection'
        }
      };

      const result = await engine.handleMessage(request, {});

      expect(result).toMatchObject(expectedResult);
      expect(result.error.type).not.toBe(ErrorTypes.TRANSLATION_ERROR);
      expect(executeTranslation).not.toHaveBeenCalled();
      expect(engine.jsonHandler.execute).not.toHaveBeenCalled();
      expect(engine.factory.getProvider).not.toHaveBeenCalled();
    });

    it('should route PDF structured batches through the JSON handler path', async () => {
      const request = {
        action: MessageActions.TRANSLATE,
        messageId: 'pdf-1',
        data: {
          text: JSON.stringify([{ blockId: 'b1', text: 'Hello' }]),
          provider: 'google',
          sourceLanguage: 'en',
          targetLanguage: 'fa',
          mode: 'pdf-translation',
          options: { rawJsonPayload: true, pdfTranslation: true }
        }
      };

      engine.jsonHandler.execute.mockResolvedValue({ success: true, translatedText: '[]' });

      const result = await engine.handleMessage(request, {});

      expect(engine.jsonHandler.execute).toHaveBeenCalled();
      expect(result.success).toBe(true);
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

    it('should not stamp success on a raw-string result from the provider', async () => {
      const mockProvider = await engine.getProvider('google');
      mockProvider.translate.mockResolvedValue('Plain String Result');

      const request = {
        action: MessageActions.TRANSLATE,
        data: { text: 'Test', provider: 'google', mode: 'selection' }
      };

      const result = await engine.handleMessage(request, {});

      expect(result.success).toBe(false);
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

    it('should reject an empty string translation as "no text" through the failure path', async () => {
      const mockProvider = await engine.getProvider('google');
      mockProvider.translate.mockResolvedValue({ translatedText: '' });

      const request = {
        action: MessageActions.TRANSLATE,
        data: { text: 'Hello world', provider: 'google', mode: 'selection' }
      };

      const result = await engine.handleMessage(request, {});

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Translation returned no text');
    });
  });

  describe('Mode Resolution & Dictionary Upgrade', () => {
    it('should upgrade MouseHover with single word to dictionary mode', async () => {
      const mockProvider = await engine.getProvider('google');
      mockProvider.constructor.supportsDictionary = true;

      const data = { text: 'apple', mode: 'mouse_hover' };
      const resolvedMode = await engine._resolveTranslationMode(data, mockProvider.constructor);

      expect(resolvedMode).toBe('dictionary');
    });

    it('should NOT upgrade Page translation with single word', async () => {
      const mockProvider = await engine.getProvider('google');
      mockProvider.constructor.supportsDictionary = true;

      const data = { text: 'apple', mode: 'page' };
      const resolvedMode = await engine._resolveTranslationMode(data, mockProvider.constructor);

      expect(resolvedMode).toBe('page'); // Stays page
    });

    it('should NOT upgrade Select Element with single word', async () => {
      const mockProvider = await engine.getProvider('google');
      mockProvider.constructor.supportsDictionary = true;

      const data = { text: 'apple', mode: 'select_element' };
      const resolvedMode = await engine._resolveTranslationMode(data, mockProvider.constructor);

      expect(resolvedMode).toBe('select_element'); // Stays select_element
    });

    it('should NOT upgrade if dictionary is disabled in settings', async () => {
      getEnableDictionaryAsync.mockResolvedValue(false);

      const mockProvider = await engine.getProvider('google');
      mockProvider.constructor.supportsDictionary = true;

      const data = { text: 'apple', mode: 'mouse_hover' };
      const resolvedMode = await engine._resolveTranslationMode(data, mockProvider.constructor);

      expect(resolvedMode).toBe('mouse_hover');
    });

    it('should NOT upgrade if text is not a single word', async () => {
      const mockProvider = await engine.getProvider('google');
      mockProvider.constructor.supportsDictionary = true;

      const data = { text: 'this is a sentence', mode: 'mouse_hover' };
      const resolvedMode = await engine._resolveTranslationMode(data, mockProvider.constructor);

      expect(resolvedMode).toBe('mouse_hover');
    });

    it('should downgrade dictionary mode if provider does not support it', async () => {
      const mockProvider = await engine.getProvider('google');
      mockProvider.constructor.supportsDictionary = false;

      const data = { text: 'word', mode: 'dictionary' };
      const resolvedMode = await engine._resolveTranslationMode(data, mockProvider.constructor);

      expect(resolvedMode).toBe('selection');
    });
  });
});
