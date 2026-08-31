import { CONFIG } from '@/shared/config/config.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROXY, 'ProxySettings');

export const PROXY_SETTING_KEYS = Object.freeze([
  'PROXY_ENABLED',
  'PROXY_TYPE',
  'PROXY_HOST',
  'PROXY_PORT',
  'PROXY_USERNAME',
  'PROXY_PASSWORD'
]);

function getProxyDefaults() {
  return {
    PROXY_ENABLED: CONFIG.PROXY_ENABLED,
    PROXY_TYPE: CONFIG.PROXY_TYPE,
    PROXY_HOST: CONFIG.PROXY_HOST,
    PROXY_PORT: CONFIG.PROXY_PORT,
    PROXY_USERNAME: CONFIG.PROXY_USERNAME,
    PROXY_PASSWORD: CONFIG.PROXY_PASSWORD
  };
}

/**
 * Load proxy configuration without exposing unrelated persisted settings.
 *
 * @returns {Promise<Object>} Proxy settings with canonical defaults applied.
 */
export async function getProxySettingsAsync() {
  const proxyDefaults = getProxyDefaults();

  try {
    const storedSettings = await storageManager.get(PROXY_SETTING_KEYS);

    return Object.fromEntries(
      PROXY_SETTING_KEYS.map(key => [
        key,
        storedSettings?.[key] ?? proxyDefaults[key]
      ])
    );
  } catch (error) {
    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, 'proxy-settings-load');
    } else {
      logger.error('Failed to load proxy settings:', error);
    }

    return proxyDefaults;
  }
}

/**
 * Resolve current proxy settings into a detached request configuration.
 *
 * @returns {Promise<Object>} Request-local proxy configuration snapshot.
 */
export async function resolveProxyConfig() {
  const settings = await getProxySettingsAsync();

  return {
    enabled: settings.PROXY_ENABLED || false,
    type: settings.PROXY_TYPE || 'http',
    host: settings.PROXY_HOST || '',
    port: settings.PROXY_PORT || 8080,
    auth: {
      username: settings.PROXY_USERNAME || '',
      password: settings.PROXY_PASSWORD || ''
    }
  };
}
