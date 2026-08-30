import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseProvider } from './BaseProvider.js';
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { proxyManager } from "@/shared/proxy/ProxyManager.js";
import { getProxySettingsAsync } from "@/shared/proxy/ProxySettings.js";
import { ProviderRequestEngine } from "@/features/translation/providers/utils/ProviderRequestEngine.js";
import { providerCoordinator } from "@/features/translation/core/ProviderCoordinator.js";

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

vi.mock('@/shared/proxy/ProxySettings.js', () => ({
  getProxySettingsAsync: vi.fn(() => Promise.resolve({}))
}));

vi.mock('@/features/translation/providers/utils/ProviderRequestEngine.js', () => ({
  ProviderRequestEngine: {
    executeRequest: vi.fn(),
    executeApiCall: vi.fn()
  }
}));

vi.mock('@/features/translation/core/ProviderCoordinator.js', () => ({
  providerCoordinator: {
    execute: vi.fn()
  }
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

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createProxySettings = (overrides = {}) => ({
  PROXY_ENABLED: false,
  PROXY_TYPE: 'http',
  PROXY_HOST: '',
  PROXY_PORT: 8080,
  PROXY_USERNAME: '',
  PROXY_PASSWORD: '',
  ...overrides
});

describe('BaseProvider', () => {
  let provider;

  beforeEach(async () => {
    vi.clearAllMocks();
    provider = new MockProvider();
    await Promise.resolve();
    vi.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with correct name and default values', () => {
      expect(provider.providerName).toBe('MockProvider');
      expect(provider).not.toHaveProperty('sessionContext');
      expect(provider.providerSettingKey).toBeNull();
      expect(provider).not.toHaveProperty('storeSessionContext');
      expect(provider).not.toHaveProperty('shouldResetSession');
    });

    it('should have default static capabilities', () => {
      expect(BaseProvider.reliableJsonMode).toBe(false);
      expect(BaseProvider.supportsDictionary).toBe(false);
    });

    it('should call _initializeProxy on creation', async () => {
      vi.mocked(getProxySettingsAsync).mockResolvedValue({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'socks',
        PROXY_HOST: 'localhost',
        PROXY_PORT: 9000,
        PROXY_USERNAME: 'user',
        PROXY_PASSWORD: 'password'
      });

      // We need to re-instantiate because _initializeProxy is called in constructor
      provider = new MockProvider();
      
      // Drain constructor's async continuation.
      await Promise.resolve();

      expect(proxyManager.setConfig).toHaveBeenCalledWith(expect.objectContaining({
        enabled: true,
        type: 'socks',
        host: 'localhost',
        port: 9000,
        auth: { username: 'user', password: 'password' }
      }));
    });

    it('should use defaults in _initializeProxy if settings are missing', async () => {
      vi.mocked(getProxySettingsAsync).mockResolvedValue({});
      provider = new MockProvider();
      await Promise.resolve();

      expect(proxyManager.setConfig).toHaveBeenCalledWith({
        enabled: false,
        type: 'http',
        host: '',
        port: 8080,
        auth: { username: '', password: '' }
      });
    });

    it('should return a detached proxy snapshot', async () => {
      const settings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'socks',
        PROXY_HOST: 'snapshot-proxy',
        PROXY_PORT: 9010,
        PROXY_USERNAME: 'user',
        PROXY_PASSWORD: 'password'
      });
      vi.mocked(getProxySettingsAsync).mockResolvedValue(settings);

      const snapshot = await provider._initializeProxy();
      const committedConfig = proxyManager.setConfig.mock.calls[0][0];

      expect(snapshot).toEqual(committedConfig);
      expect(snapshot).not.toBe(committedConfig);
      expect(snapshot.auth).not.toBe(committedConfig.auth);

      snapshot.auth.password = 'changed';
      expect(committedConfig.auth.password).toBe('password');
    });

    it('should not let an older initialization overwrite a newer applied one', async () => {
      const olderRead = createDeferred();
      const newerRead = createDeferred();
      const olderSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'http',
        PROXY_HOST: 'old-proxy',
        PROXY_PORT: 8001,
        PROXY_USERNAME: 'old-user',
        PROXY_PASSWORD: 'old-password'
      });
      const newerSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'socks',
        PROXY_HOST: 'new-proxy',
        PROXY_PORT: 9001,
        PROXY_USERNAME: 'new-user',
        PROXY_PASSWORD: 'new-password'
      });

      vi.mocked(getProxySettingsAsync)
        .mockReturnValueOnce(olderRead.promise)
        .mockReturnValueOnce(newerRead.promise);

      const olderInitialization = provider._initializeProxy();
      const newerInitialization = provider._initializeProxy();

      newerRead.resolve(newerSettings);
      const newerSnapshot = await newerInitialization;
      olderRead.resolve(olderSettings);
      const olderSnapshot = await olderInitialization;

      expect(newerSnapshot).toEqual({
        enabled: true,
        type: 'socks',
        host: 'new-proxy',
        port: 9001,
        auth: { username: 'new-user', password: 'new-password' }
      });
      expect(olderSnapshot).toEqual({
        enabled: true,
        type: 'http',
        host: 'old-proxy',
        port: 8001,
        auth: { username: 'old-user', password: 'old-password' }
      });

      expect(proxyManager.setConfig).toHaveBeenCalledTimes(1);
      expect(proxyManager.setConfig).toHaveBeenCalledWith({
        enabled: true,
        type: 'socks',
        host: 'new-proxy',
        port: 9001,
        auth: { username: 'new-user', password: 'new-password' }
      });
    });

    it('should apply older settings while newer initialization is pending', async () => {
      const olderRead = createDeferred();
      const newerRead = createDeferred();
      const olderSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_HOST: 'old-proxy',
        PROXY_PORT: 8007
      });
      const newerSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'socks',
        PROXY_HOST: 'new-proxy',
        PROXY_PORT: 9007
      });

      vi.mocked(getProxySettingsAsync)
        .mockReturnValueOnce(olderRead.promise)
        .mockReturnValueOnce(newerRead.promise);

      const olderInitialization = provider._initializeProxy();
      const newerInitialization = provider._initializeProxy();

      olderRead.resolve(olderSettings);
      await olderInitialization;

      expect(proxyManager.setConfig).toHaveBeenCalledTimes(1);
      expect(proxyManager.setConfig).toHaveBeenNthCalledWith(1, {
        enabled: true,
        type: 'http',
        host: 'old-proxy',
        port: 8007,
        auth: { username: '', password: '' }
      });

      newerRead.resolve(newerSettings);
      await newerInitialization;

      expect(proxyManager.setConfig).toHaveBeenCalledTimes(2);
      expect(proxyManager.setConfig).toHaveBeenNthCalledWith(2, {
        enabled: true,
        type: 'socks',
        host: 'new-proxy',
        port: 9007,
        auth: { username: '', password: '' }
      });
    });

    it('should prevent constructor initialization from overwriting request initialization', async () => {
      const constructorRead = createDeferred();
      const requestRead = createDeferred();
      const constructorSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'http',
        PROXY_HOST: 'constructor-proxy',
        PROXY_PORT: 8002
      });
      const requestSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'https',
        PROXY_HOST: 'request-proxy',
        PROXY_PORT: 9002
      });

      vi.mocked(getProxySettingsAsync)
        .mockReturnValueOnce(constructorRead.promise)
        .mockReturnValueOnce(requestRead.promise);

      provider = new MockProvider();
      const requestInitialization = provider._initializeProxy();

      requestRead.resolve(requestSettings);
      await requestInitialization;
      constructorRead.resolve(constructorSettings);
      await Promise.resolve();

      expect(proxyManager.setConfig).toHaveBeenCalledTimes(1);
      expect(proxyManager.setConfig).toHaveBeenCalledWith({
        enabled: true,
        type: 'https',
        host: 'request-proxy',
        port: 9002,
        auth: { username: '', password: '' }
      });
    });

    it('should share generation ordering across provider instances', async () => {
      const providerARead = createDeferred();
      const providerBRead = createDeferred();
      const providerASettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'http',
        PROXY_HOST: 'provider-a-proxy',
        PROXY_PORT: 8003
      });
      const providerBSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'socks',
        PROXY_HOST: 'provider-b-proxy',
        PROXY_PORT: 9003
      });

      vi.mocked(getProxySettingsAsync)
        .mockReturnValueOnce(providerARead.promise)
        .mockReturnValueOnce(providerBRead.promise);

      new MockProvider();
      new MockProvider();

      providerBRead.resolve(providerBSettings);
      await Promise.resolve();
      providerARead.resolve(providerASettings);
      await Promise.resolve();

      expect(proxyManager.setConfig).toHaveBeenCalledTimes(1);
      expect(proxyManager.setConfig).toHaveBeenCalledWith({
        enabled: true,
        type: 'socks',
        host: 'provider-b-proxy',
        port: 9003,
        auth: { username: '', password: '' }
      });
    });

    it('should not restore stale enabled proxy after newer disable settings', async () => {
      const olderRead = createDeferred();
      const newerRead = createDeferred();
      const olderSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'socks',
        PROXY_HOST: 'old-proxy',
        PROXY_PORT: 8004,
        PROXY_USERNAME: 'old-user',
        PROXY_PASSWORD: 'old-password'
      });
      const newerSettings = createProxySettings({
        PROXY_ENABLED: false,
        PROXY_TYPE: 'http',
        PROXY_HOST: '',
        PROXY_PORT: 8080
      });

      vi.mocked(getProxySettingsAsync)
        .mockReturnValueOnce(olderRead.promise)
        .mockReturnValueOnce(newerRead.promise);

      const olderInitialization = provider._initializeProxy();
      const newerInitialization = provider._initializeProxy();

      newerRead.resolve(newerSettings);
      await newerInitialization;
      olderRead.resolve(olderSettings);
      await olderInitialization;

      expect(proxyManager.setConfig).toHaveBeenCalledTimes(1);
      expect(proxyManager.setConfig).toHaveBeenCalledWith({
        enabled: false,
        type: 'http',
        host: '',
        port: 8080,
        auth: { username: '', password: '' }
      });
    });

    it('should commit sequential initialization refreshes in order', async () => {
      const firstSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'http',
        PROXY_HOST: 'first-proxy',
        PROXY_PORT: 8005
      });
      const secondSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'https',
        PROXY_HOST: 'second-proxy',
        PROXY_PORT: 9005
      });

      vi.mocked(getProxySettingsAsync)
        .mockResolvedValueOnce(firstSettings)
        .mockResolvedValueOnce(secondSettings);

      await provider._initializeProxy();
      await provider._initializeProxy();

      expect(proxyManager.setConfig).toHaveBeenCalledTimes(2);
      expect(proxyManager.setConfig).toHaveBeenNthCalledWith(1, {
        enabled: true,
        type: 'http',
        host: 'first-proxy',
        port: 8005,
        auth: { username: '', password: '' }
      });
      expect(proxyManager.setConfig).toHaveBeenNthCalledWith(2, {
        enabled: true,
        type: 'https',
        host: 'second-proxy',
        port: 9005,
        auth: { username: '', password: '' }
      });
    });

    it('should preserve current config when newest initialization fails', async () => {
      const existingSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_TYPE: 'socks',
        PROXY_HOST: 'existing-proxy',
        PROXY_PORT: 8006,
        PROXY_USERNAME: 'existing-user',
        PROXY_PASSWORD: 'existing-password'
      });

      vi.mocked(getProxySettingsAsync).mockResolvedValueOnce(existingSettings);
      await provider._initializeProxy();

      vi.mocked(getProxySettingsAsync).mockRejectedValueOnce(new Error('settings unavailable'));
      await expect(provider._initializeProxy()).resolves.toBeUndefined();

      expect(proxyManager.setConfig).toHaveBeenCalledTimes(1);
      expect(proxyManager.setConfig).toHaveBeenLastCalledWith({
        enabled: true,
        type: 'socks',
        host: 'existing-proxy',
        port: 8006,
        auth: { username: 'existing-user', password: 'existing-password' }
      });
    });

    it('should allow older settings to apply when newer initialization fails', async () => {
      const olderRead = createDeferred();
      const newerRead = createDeferred();
      const olderSettings = createProxySettings({
        PROXY_ENABLED: true,
        PROXY_HOST: 'older-proxy',
        PROXY_PORT: 8008
      });

      vi.mocked(getProxySettingsAsync)
        .mockReturnValueOnce(olderRead.promise)
        .mockReturnValueOnce(newerRead.promise);

      const olderInitialization = provider._initializeProxy();
      const newerInitialization = provider._initializeProxy();

      newerRead.reject(new Error('newer settings unavailable'));
      await newerInitialization;

      expect(proxyManager.setConfig).not.toHaveBeenCalled();

      olderRead.resolve(olderSettings);
      await olderInitialization;

      expect(proxyManager.setConfig).toHaveBeenCalledTimes(1);
      expect(proxyManager.setConfig).toHaveBeenCalledWith({
        enabled: true,
        type: 'http',
        host: 'older-proxy',
        port: 8008,
        auth: { username: '', password: '' }
      });
    });

  });

  describe('Abstract Methods', () => {
    it('should throw error if abstract methods are not implemented', async () => {
      const base = new BaseProvider('Base');
      expect(() => base._getLangCode()).toThrow(/must be implemented/);
      await expect(base._batchTranslate()).rejects.toThrow(/must be implemented/);
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

  describe('Provider Cleanup Hook', () => {
    it('keeps resetSessionContext callable as a compatibility hook', () => {
      expect(() => provider.resetSessionContext()).not.toThrow();
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
