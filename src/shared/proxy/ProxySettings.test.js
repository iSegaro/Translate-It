import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '@/shared/config/config.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getProxySettingsAsync, resolveProxyConfig, resolveProxyConfigFromSettings, PROXY_SETTING_KEYS } from './ProxySettings.js';

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    get: vi.fn()
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

describe('getProxySettingsAsync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads exactly proxy keys and filters unrelated storage values', async () => {
    vi.mocked(storageManager.get).mockResolvedValue({
      PROXY_ENABLED: true,
      PROXY_TYPE: 'socks',
      PROXY_HOST: 'localhost',
      PROXY_PORT: 9050,
      PROXY_USERNAME: 'user',
      PROXY_PASSWORD: 'password',
      OPENAI_API_KEY: 'should-not-escape',
      unrelatedSetting: true
    });

    const settings = await getProxySettingsAsync();

    expect(storageManager.get).toHaveBeenCalledWith(PROXY_SETTING_KEYS);
    expect(storageManager.get).not.toHaveBeenCalledWith(null);
    expect(Object.keys(settings)).toEqual(PROXY_SETTING_KEYS);
    expect(settings).toEqual({
      PROXY_ENABLED: true,
      PROXY_TYPE: 'socks',
      PROXY_HOST: 'localhost',
      PROXY_PORT: 9050,
      PROXY_USERNAME: 'user',
      PROXY_PASSWORD: 'password'
    });
    expect(settings).not.toHaveProperty('OPENAI_API_KEY');
    expect(settings).not.toHaveProperty('unrelatedSetting');
  });

  it('applies canonical defaults when persisted proxy values are missing', async () => {
    vi.mocked(storageManager.get).mockResolvedValue({});

    await expect(getProxySettingsAsync()).resolves.toEqual({
      PROXY_ENABLED: CONFIG.PROXY_ENABLED,
      PROXY_TYPE: CONFIG.PROXY_TYPE,
      PROXY_HOST: CONFIG.PROXY_HOST,
      PROXY_PORT: CONFIG.PROXY_PORT,
      PROXY_USERNAME: CONFIG.PROXY_USERNAME,
      PROXY_PASSWORD: CONFIG.PROXY_PASSWORD
    });
  });

  it('returns canonical defaults when storage loading fails', async () => {
    vi.mocked(storageManager.get).mockRejectedValue(new Error('storage unavailable'));

    await expect(getProxySettingsAsync()).resolves.toEqual({
      PROXY_ENABLED: CONFIG.PROXY_ENABLED,
      PROXY_TYPE: CONFIG.PROXY_TYPE,
      PROXY_HOST: CONFIG.PROXY_HOST,
      PROXY_PORT: CONFIG.PROXY_PORT,
      PROXY_USERNAME: CONFIG.PROXY_USERNAME,
      PROXY_PASSWORD: CONFIG.PROXY_PASSWORD
    });
  });

  it('maps settings into detached canonical proxy configuration', async () => {
    vi.mocked(storageManager.get).mockResolvedValue({
      PROXY_ENABLED: true,
      PROXY_TYPE: 'socks',
      PROXY_HOST: 'proxy.test',
      PROXY_PORT: 9050,
      PROXY_USERNAME: 'user',
      PROXY_PASSWORD: 'password'
    });

    const firstConfig = await resolveProxyConfig();
    const secondConfig = await resolveProxyConfig();

    expect(firstConfig).toEqual({
      enabled: true,
      type: 'socks',
      host: 'proxy.test',
      port: 9050,
      auth: { username: 'user', password: 'password' }
    });
    expect(secondConfig).not.toBe(firstConfig);
    expect(secondConfig.auth).not.toBe(firstConfig.auth);
    expect(storageManager.get).toHaveBeenCalledWith(PROXY_SETTING_KEYS);
  });

  it('maps draft proxy settings to a detached config without reading or writing storage', () => {
    const draft = {
      PROXY_ENABLED: true,
      PROXY_TYPE: 'socks',
      PROXY_HOST: 'draft.proxy.test',
      PROXY_PORT: 1080,
      PROXY_USERNAME: 'draft-user',
      PROXY_PASSWORD: 'draft-password',
    };

    const firstConfig = resolveProxyConfigFromSettings(draft);
    const secondConfig = resolveProxyConfigFromSettings(draft);
    draft.PROXY_HOST = 'mutated-after-snapshot.test';
    draft.PROXY_PASSWORD = 'mutated-password';

    expect(firstConfig).toEqual({
      enabled: true,
      type: 'socks',
      host: 'draft.proxy.test',
      port: 1080,
      auth: { username: 'draft-user', password: 'draft-password' },
    });
    expect(firstConfig).not.toBe(secondConfig);
    expect(firstConfig.auth).not.toBe(secondConfig.auth);
    expect(storageManager.get).not.toHaveBeenCalled();
  });

  it('applies the persisted resolver defaults to incomplete draft settings', () => {
    expect(resolveProxyConfigFromSettings({ PROXY_ENABLED: true })).toEqual({
      enabled: true,
      type: CONFIG.PROXY_TYPE || 'http',
      host: CONFIG.PROXY_HOST || '',
      port: CONFIG.PROXY_PORT || 8080,
      auth: {
        username: CONFIG.PROXY_USERNAME || '',
        password: CONFIG.PROXY_PASSWORD || '',
      },
    });
  });
});
