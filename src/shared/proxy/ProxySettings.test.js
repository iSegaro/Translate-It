import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '@/shared/config/config.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getProxySettingsAsync, PROXY_SETTING_KEYS } from './ProxySettings.js';

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    get: vi.fn()
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
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
});
