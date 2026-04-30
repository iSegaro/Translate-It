import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranslationHandler } from './TranslationHandler.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';

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

vi.mock('@/shared/config/constants.js', () => ({
  AUTO_DETECT_VALUE: 'auto'
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: vi.fn()
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
    isValidSync: vi.fn().mockReturnValue(true)
  }
}));

describe('TranslationHandler', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('should handle direct translation result from sendMessage', async () => {
    const mockResult = { translatedText: 'سلام', sourceLanguage: 'en', targetLanguage: 'fa' };
    sendMessage.mockResolvedValue(mockResult);

    const result = await handler.performTranslation('hello');

    expect(result.translatedText).toBe('سلام');
    expect(sendMessage).toHaveBeenCalled();
  });

  it('should handle port fallback result from sendMessage', async () => {
    const mockResult = { result: { translatedText: 'سلام', success: true } };
    sendMessage.mockResolvedValue(mockResult);

    const result = await handler.performTranslation('hello');

    expect(result.translatedText).toBe('سلام');
  });

  it('should handle translation timeout', async () => {
    sendMessage.mockResolvedValue({ type: 'ACK' }); // Not a result

    const translationPromise = handler.performTranslation('hello');
    
    // Fast-forward to trigger timeout
    vi.advanceTimersByTime(31000);

    await expect(translationPromise).rejects.toThrow('Translation timeout');
  });

  it('should handle cancellation', async () => {
    sendMessage.mockResolvedValue({ type: 'ACK' });
    
    const translationPromise = handler.performTranslation('hello');
    
    // Cancel it
    handler.cancelTranslation('mock-msg-id');

    await expect(translationPromise).rejects.toThrow('Translation cancelled');
  });

  it('should handle translation error message', async () => {
    const message = {
      messageId: 'mock-msg-id',
      data: { error: { message: 'API Error' } }
    };
    
    // Start translation
    sendMessage.mockResolvedValue({ type: 'ACK' });
    const promise = handler.performTranslation('hello');
    
    // Simulate result arrival
    handler.handleTranslationResult(message);
    
    await expect(promise).rejects.toThrow('API Error');
  });
});
