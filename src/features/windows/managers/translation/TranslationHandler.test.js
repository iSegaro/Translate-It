import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranslationHandler } from './TranslationHandler.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { registerTranslation, sendUnifiedTranslation } from '@/shared/messaging/core/ContentScriptIntegration.js';
import { pageEventBus, WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js';

// Mock ALL dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    operation: vi.fn()
  }))
}));

vi.mock('../core/WindowsConfig.js', () => ({
  WindowsConfig: {
    TIMEOUTS: {
      TRANSLATION_TIMEOUT: 30000
    }
  }
}));

vi.mock('@/utils/messaging/messageId.js', () => ({
  generateTranslationMessageId: vi.fn().mockReturnValue('mock-msg-id')
}));

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    POPUP_MAX_CHARS: 5000,
    SIDEPANEL_MAX_CHARS: 10000,
    SELECTION_MAX_CHARS: 5000,
    SELECT_ELEMENT_MAX_CHARS: 300000,
  },
  getSelectionMaxCharsAsync: vi.fn(() => Promise.resolve(5000)),
  TranslationMode: {
    Selection: 'selection',
    Dictionary_Translation: 'dictionary'
  }
}));

vi.mock('@/features/translation/providers/ProviderConstants.js', () => ({
  ProviderRegistryIds: {
    GOOGLE_V2: 'google_v2'
  }
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: vi.fn().mockImplementation((key, def) => def)
  }
}));

vi.mock('@/shared/constants/core.js', () => ({
  AUTO_DETECT_VALUE: 'auto'
}));

vi.mock('@/shared/messaging/core/ContentScriptIntegration.js', () => ({
  registerTranslation: vi.fn(),
  sendUnifiedTranslation: vi.fn(),
  cancelTranslation: vi.fn()
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    TRANSLATE: 'TRANSLATE'
  }
}));

vi.mock('@/shared/utils/text/textAnalysis.js', () => ({
  isSingleWordOrShortPhrase: vi.fn().mockReturnValue(false)
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn().mockImplementation(() => ({
      handle: vi.fn().mockResolvedValue()
    }))
  }
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isValidSync: vi.fn().mockReturnValue(true),
    isContentScript: vi.fn().mockReturnValue(true)
  }
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: vi.fn()
  },
  WINDOWS_MANAGER_EVENTS: {
    UPDATE_WINDOW: 'UPDATE_WINDOW'
  },
  WindowsManagerEvents: {
    updateWindow: vi.fn((id, detail) => pageEventBus.emit('UPDATE_WINDOW', { id, ...detail }))
  }
}));

describe('TranslationHandler', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
    registerTranslation.mockImplementation(() => {});
    vi.useFakeTimers();
    handler = new TranslationHandler();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize', () => {
    expect(handler).toBeDefined();
    expect(handler.activeRequests.size).toBe(0);
  });

  it('should resolve the correct provider based on settings', () => {
    settingsManager.get.mockImplementation((key, def) => {
      if (key === 'TRANSLATION_API') return 'bing';
      return def;
    });

    const provider = handler.getEffectiveProvider('hello');
    expect(provider).toBe('bing');
  });

  it('should prioritize manual override for provider', () => {
    const provider = handler.getEffectiveProvider('hello', { provider: 'deepl' });
    expect(provider).toBe('deepl');
  });

  it('should handle direct translation result from sendUnifiedTranslation', async () => {
    const mockResult = { success: true, translatedText: 'سلام', sourceLanguage: 'en', targetLanguage: 'fa', streaming: false };
    sendUnifiedTranslation.mockResolvedValue(mockResult);

    const result = await handler.performTranslation('hello');

    expect(result.translatedText).toBe('سلام');
    expect(sendUnifiedTranslation).toHaveBeenCalled();
  });

  it('should handle streaming translation result', async () => {
    // 1. Setup sendUnifiedTranslation to return streaming status
    sendUnifiedTranslation.mockResolvedValue({ success: true, streaming: true });

    // 2. Setup registerTranslation to simulate streaming updates and completion
    registerTranslation.mockImplementation((id, callbacks) => {
      // Simulate streaming update
      setTimeout(() => {
        callbacks.onStreamUpdate({ data: ['سلام'] });
      }, 10);
      
      // Simulate streaming end
      setTimeout(() => {
        callbacks.onStreamEnd({ success: true, sourceLanguage: 'en', targetLanguage: 'fa' });
      }, 20);
    });

    const translationPromise = handler.performTranslation('hello', { windowId: 'win-123' });

    // Fast-forward timers to complete the stream
    await vi.runAllTimersAsync();

    const result = await translationPromise;

    expect(result.translatedText).toBe('سلام');
    expect(pageEventBus.emit).toHaveBeenCalledWith(WINDOWS_MANAGER_EVENTS.UPDATE_WINDOW, expect.objectContaining({
      id: 'win-123',
      initialTranslatedText: 'سلام'
    }));
  });

  it('should handle translation timeout', async () => {
    sendUnifiedTranslation.mockResolvedValue({ success: true, streaming: true });
    // Don't simulate any streaming callbacks to force timeout

    const translationPromise = handler.performTranslation('hello');
    
    // Create the rejection expectation promise BEFORE advancing timers
    const rejectionExpectation = expect(translationPromise).rejects.toThrow('Translation timeout');

    // Fast-forward to trigger timeout
    await vi.advanceTimersByTimeAsync(31000);

    // Now await the expectation
    await rejectionExpectation;
  });

  it('should handle cancellation', async () => {
    sendUnifiedTranslation.mockResolvedValue({ success: true, streaming: true });
    
    const translationPromise = handler.performTranslation('hello');
    
    // Cancel it
    handler.cancelTranslation('mock-msg-id');

    const result = await translationPromise;
    expect(result.cancelled).toBe(true);
  });

  it('should handle translation error message', async () => {
    const message = {
      messageId: 'mock-msg-id',
      data: { error: { message: 'API Error' } }
    };
    
    // Start translation
    sendUnifiedTranslation.mockResolvedValue({ success: true, streaming: true });
    const promise = handler.performTranslation('hello');
    
    // Simulate result arrival (via handleTranslationResult fallback)
    handler.handleTranslationResult(message);
    
    await expect(promise).rejects.toThrow('API Error');
  });
});
