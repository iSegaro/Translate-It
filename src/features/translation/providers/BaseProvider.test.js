import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseProvider } from './BaseProvider.js';
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { proxyManager } from "@/shared/proxy/ProxyManager.js";
import { ProviderRequestEngine } from "@/features/translation/providers/utils/ProviderRequestEngine.js";
import { TraditionalBatchProcessor } from "@/features/translation/providers/utils/TraditionalBatchProcessor.js";
import { providerCoordinator } from "@/features/translation/core/ProviderCoordinator.js";
import { getSettingsAsync } from "@/shared/config/config.js";

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}));

vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    setConfig: vi.fn(),
    testConnection: vi.fn()
  }
}));

vi.mock('@/features/translation/providers/utils/ProviderRequestEngine.js', () => ({
  ProviderRequestEngine: {
    executeRequest: vi.fn(),
    executeApiCall: vi.fn()
  }
}));

vi.mock('@/features/translation/providers/utils/TraditionalBatchProcessor.js', () => ({
  TraditionalBatchProcessor: {
    processInBatches: vi.fn()
  }
}));

vi.mock('@/features/translation/core/ProviderCoordinator.js', () => ({
  providerCoordinator: {
    execute: vi.fn()
  }
}));

vi.mock('@/shared/config/config.js', () => ({
  getSettingsAsync: vi.fn(() => Promise.resolve({}))
}));

// Mock for dynamic import
vi.mock('@/features/translation/core/RateLimitManager.js', () => ({
  rateLimitManager: {
    executeWithRateLimit: vi.fn((name, task) => task())
  },
  TranslationPriority: {
    NORMAL: 'normal',
    HIGH: 'high'
  }
}));

// Mock subclass for testing
class MockProvider extends BaseProvider {
  constructor() {
    super('MockProvider');
  }
  _getLangCode(lang) { return lang; }
  async _batchTranslate() { return []; }
}

describe('BaseProvider', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MockProvider();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with correct name and default values', () => {
      expect(provider.providerName).toBe('MockProvider');
      expect(provider.sessionContext).toBeNull();
      expect(provider.providerSettingKey).toBeNull();
    });

    it('should have default static capabilities', () => {
      expect(BaseProvider.reliableJsonMode).toBe(false);
      expect(BaseProvider.supportsDictionary).toBe(false);
    });

    it('should call _initializeProxy on creation', async () => {
      vi.mocked(getSettingsAsync).mockResolvedValue({
        PROXY_ENABLED: true,
        PROXY_HOST: 'localhost',
        PROXY_PORT: 9000
      });

      // We need to re-instantiate because _initializeProxy is called in constructor
      provider = new MockProvider();
      
      // Since it's async and not awaited in constructor, we wait a bit
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(proxyManager.setConfig).toHaveBeenCalledWith(expect.objectContaining({
        enabled: true,
        host: 'localhost',
        port: 9000
      }));
    });

    it('should use defaults in _initializeProxy if settings are missing', async () => {
      vi.mocked(getSettingsAsync).mockResolvedValue({});
      provider = new MockProvider();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(proxyManager.setConfig).toHaveBeenCalledWith({
        enabled: false,
        type: 'http',
        host: '',
        port: 8080,
        auth: { username: '', password: '' }
      });
    });
  });

  describe('Abstract Methods', () => {
    it('should throw error if abstract methods are not implemented', async () => {
      const base = new BaseProvider('Base');
      expect(() => base._getLangCode()).toThrow(/must be implemented/);
      await expect(base._batchTranslate()).rejects.toThrow(/must be implemented/);
      await expect(base.translateImage()).rejects.toThrow(/not supported/);
    });
  });

  describe('translate', () => {
    it('should delegate to providerCoordinator', async () => {
      await provider.translate('hello', 'en', 'fa', { opt: 1 });
      expect(providerCoordinator.execute).toHaveBeenCalledWith(
        provider, 'hello', 'en', 'fa', { opt: 1 }
      );
    });
  });

  describe('_isSpecificTextJsonFormat', () => {
    it('should validate correct JSON format', () => {
      const valid = [{ text: 'a' }, { text: 'b' }];
      expect(provider._isSpecificTextJsonFormat(valid)).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(provider._isSpecificTextJsonFormat(null)).toBe(false);
      expect(provider._isSpecificTextJsonFormat([])).toBe(false);
      expect(provider._isSpecificTextJsonFormat(['not object'])).toBe(false);
      expect(provider._isSpecificTextJsonFormat([{ other: 'val' }])).toBe(false);
    });
  });

  describe('Delegated Request Methods', () => {
    it('_executeRequest should delegate to ProviderRequestEngine', async () => {
      const params = { url: 'test' };
      await provider._executeRequest(params);
      expect(ProviderRequestEngine.executeRequest).toHaveBeenCalledWith(provider, params);
    });

    it('_executeApiCall should delegate to ProviderRequestEngine', async () => {
      const params = { method: 'GET' };
      await provider._executeApiCall(params);
      expect(ProviderRequestEngine.executeApiCall).toHaveBeenCalledWith(provider, params);
    });

    it('_processInBatches should delegate to TraditionalBatchProcessor', async () => {
      const segments = ['a'];
      const translateChunk = vi.fn();
      await provider._processInBatches(segments, translateChunk, { limit: 10 });
      expect(TraditionalBatchProcessor.processInBatches).toHaveBeenCalledWith(
        provider, segments, translateChunk, { limit: 10 }, null, null
      );
    });
  });

  describe('_executeWithRateLimit', () => {
    it('should check abort signal before execution', async () => {
      const controller = new AbortController();
      controller.abort();
      const task = vi.fn();
      
      await expect(provider._executeWithRateLimit(task, 'ctx', null, { abortController: controller }))
        .rejects.toThrow('Task aborted before execution');
      
      expect(task).not.toHaveBeenCalled();
    });

    it('should check abort signal after execution', async () => {
      const controller = new AbortController();
      const task = vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.resolve('done');
      });

      await expect(provider._executeWithRateLimit(task, 'ctx', null, { abortController: controller }))
        .rejects.toThrow('Task aborted during execution');
    });

    it('should return result if not aborted', async () => {
      const task = vi.fn().mockResolvedValue('success');
      const result = await provider._executeWithRateLimit(task);
      expect(result).toBe('success');
    });
  });

  describe('_validateConfig', () => {
    it('should throw API_KEY_MISSING for key fields', () => {
      expect(() => provider._validateConfig({}, ['apiKey'], 'test-ctx'))
        .toThrow(ErrorTypes.API_KEY_MISSING);
    });

    it('should throw API_URL_MISSING for url fields', () => {
      expect(() => provider._validateConfig({}, ['apiUrl'], 'test-ctx'))
        .toThrow(ErrorTypes.API_URL_MISSING);
    });

    it('should throw MODEL_MISSING for model fields', () => {
      expect(() => provider._validateConfig({}, ['modelName'], 'test-ctx'))
        .toThrow(ErrorTypes.MODEL_MISSING);
    });

    it('should throw generic API error for other fields', () => {
      const expectedType = ErrorTypes.API_CONFIG_INVALID; 
      
      try {
        provider._validateConfig({}, ['otherField'], 'test-ctx');
        throw new Error('Should have thrown');
      } catch (e) {
        if (e.message === 'Should have thrown') throw e;
        expect(e.type).toBe(ErrorTypes.API_CONFIG_INVALID);
        expect(e.context).toBe('test-ctx');
        expect(e.providerName).toBe('MockProvider');
      }
    });
  });

  describe('Session Context', () => {
    it('should store and reset session context', () => {
      provider.storeSessionContext({ id: 1 });
      expect(provider.sessionContext).toMatchObject({ id: 1 });
      expect(provider.sessionContext.timestamp).toBeDefined();

      provider.resetSessionContext();
      expect(provider.sessionContext).toBeNull();
    });

    it('should correctly identify when session should be reset', () => {
      vi.useFakeTimers();
      const now = Date.now();
      
      provider.storeSessionContext({ lastUsed: now });
      expect(provider.shouldResetSession()).toBe(false);

      // Advance time by 6 minutes (360,000 ms)
      vi.setSystemTime(now + 360000);
      expect(provider.shouldResetSession()).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('testProxyConnection', () => {
    it('should initialize proxy and test connection', async () => {
      vi.mocked(proxyManager.testConnection).mockResolvedValue(true);
      const result = await provider.testProxyConnection('http://test.com');
      
      expect(proxyManager.testConnection).toHaveBeenCalledWith('http://test.com');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      vi.mocked(proxyManager.testConnection).mockRejectedValue(new Error('Fail'));
      const result = await provider.testProxyConnection('http://test.com');
      expect(result).toBe(false);
    });
  });

  describe('_isSameLanguage', () => {
    it('should return true if languages match', () => {
      expect(provider._isSameLanguage('en', 'en')).toBe(true);
      expect(provider._isSameLanguage('en', 'fa')).toBe(false);
    });
  });
});
