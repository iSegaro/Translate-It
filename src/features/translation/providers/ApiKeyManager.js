/**
 * ApiKeyManager - Centralized API key management with failover support
 *
 * Responsibilities:
 * - Parse newline-separated API keys into arrays
 * - Get primary key (first in list)
 * - Move successful key to front of list
 * - Check if error should trigger failover
 * - Test all keys and reorder them (valid keys first)
 */

import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'ApiKeyManager');

/**
 * Settings key mapping for each provider
 */
const PROVIDER_SETTINGS_KEYS = {
  OPENAI: 'OPENAI_API_KEY',
  GEMINI: 'API_KEY',
  DEEPSEEK: 'DEEPSEEK_API_KEY',
  OPENROUTER: 'OPENROUTER_API_KEY',
  DEEPL: 'DEEPL_API_KEY',
  CUSTOM: 'CUSTOM_API_KEY'
};

/**
 * Provider names for API testing
 */
const PROVIDER_NAMES = {
  OPENAI: 'OpenAI',
  GEMINI: 'Gemini',
  DEEPSEEK: 'DeepSeek',
  OPENROUTER: 'OpenRouter',
  DEEPL: 'DeepL',
  CUSTOM: 'Custom'
};

/**
 * Failover error types that should trigger key rotation
 */
const FAILOVER_ERROR_TYPES = new Set([
  ErrorTypes.API_KEY_INVALID,
  ErrorTypes.INSUFFICIENT_BALANCE,
  ErrorTypes.QUOTA_EXCEEDED,
  ErrorTypes.RATE_LIMIT_REACHED,
  ErrorTypes.DEEPL_QUOTA_EXCEEDED
]);

class ApiKeyManager {
  /**
   * Parse API key string into array of keys
   * @param {string} keyString - Newline-separated keys
   * @returns {string[]} - Array of trimmed, non-empty keys
   */
  static parseKeys(keyString) {
    if (!keyString || typeof keyString !== 'string') {
      return [];
    }
    const keys = keyString
      .split('\n')
      .map(key => key.trim())
      .filter(key => key.length > 0);

    if (keys.length > 1) {
      logger.debug(`[ApiKeyManager] Parsed ${keys.length} keys from string of length ${keyString.length}`);
    }

    return keys;
  }

  /**
   * Convert array of keys back to newline-separated string
   * @param {string[]} keys - Array of keys
   * @returns {string} - Newline-separated keys
   */
  static stringifyKeys(keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
      return '';
    }
    return keys.join('\n');
  }

  /**
   * Get all keys for a provider
   * @param {string} providerSettingKey - Settings key (e.g., 'OPENAI_API_KEY')
   * @returns {Promise<string[]>} - Array of keys
   */
  static async getKeys(providerSettingKey) {
    try {
      const result = await storageManager.get({ [providerSettingKey]: '' });
      const keyString = result[providerSettingKey] || '';

      // Debug logging to see what's actually in storage (masked for security)
      const maskedValue = keyString.length > 10 
        ? `${keyString.substring(0, 4)}...${keyString.substring(keyString.length - 4)}`
        : '***';

      logger.info(`[ApiKeyManager] Raw storage value for ${providerSettingKey}:`, {
        value: maskedValue,
        length: keyString.length,
        hasNewlines: keyString.includes('\n'),
        lineCount: keyString.split('\n').length
      });

      const keys = this.parseKeys(keyString);
      logger.debug(`[ApiKeyManager] Parsed ${keys.length} keys for ${providerSettingKey}`);
      return keys;
    } catch (error) {
      logger.error(`[ApiKeyManager] Failed to get keys for ${providerSettingKey}:`, error);
      return [];
    }
  }

  /**
   * Get primary key (first in list)
   * @param {string} providerSettingKey - Settings key
   * @returns {Promise<string>} - First key or empty string
   */
  static async getPrimaryKey(providerSettingKey) {
    const keys = await this.getKeys(providerSettingKey);
    return keys.length > 0 ? keys[0] : '';
  }

  /**
   * Move key to front of list and save to storage
   * @param {string} providerSettingKey - Settings key
   * @param {string} key - Key to promote
   * @returns {Promise<void>}
   */
  static async promoteKey(providerSettingKey, key) {
    try {
      const keys = await this.getKeys(providerSettingKey);

      // Find and remove the key from its current position
      const index = keys.indexOf(key);
      if (index === -1) {
        logger.warn(`[ApiKeyManager] Key not found in list for ${providerSettingKey}, cannot promote`);
        return;
      }

      // Remove from current position
      keys.splice(index, 1);

      // Add to front
      keys.unshift(key);

      // Save back to storage
      const keyString = this.stringifyKeys(keys);
      await storageManager.set({ [providerSettingKey]: keyString });

      logger.debug(`[ApiKeyManager] Promoted key to front for ${providerSettingKey}`);
    } catch (error) {
      logger.error(`[ApiKeyManager] Failed to promote key for ${providerSettingKey}:`, error);
    }
  }

  /**
   * Check if error should trigger failover to next key
   * @param {Error} error - Error object
   * @returns {boolean} - True if error should trigger failover
   */
  static shouldFailover(error) {
    if (!error || !error.type) {
      return false;
    }
    return FAILOVER_ERROR_TYPES.has(error.type);
  }

  /**
   * Test all keys for validity and reorder them
   * @param {string} providerSettingKey - Settings key
   * @param {string} providerName - Provider name for testing
   * @returns {Promise<Object>} - Test result with valid, invalid arrays and allInvalid flag
   */
  static async testAndReorderKeys(providerSettingKey, providerName) {
    const keys = await this.getKeys(providerSettingKey);

    if (keys.length === 0) {
      return {
        valid: [],
        invalid: [],
        allInvalid: true,
        messageKey: 'api_test_no_keys'
      };
    }

    // Import provider classes dynamically
    const providerTests = {
      'OpenAI': async (key) => await this._testOpenAIKey(key),
      'Gemini': async (key) => await this._testGeminiKey(key),
      'DeepSeek': async (key) => await this._testDeepSeekKey(key),
      'OpenRouter': async (key) => await this._testOpenRouterKey(key),
      'DeepL': async (key) => await this._testDeepLKey(key),
      'Custom': async (key) => await this._testCustomKey(key)
    };

    const testFunc = providerTests[providerName];
    if (!testFunc) {
      return {
        valid: [],
        invalid: keys,
        allInvalid: true,
        messageKey: 'api_test_unknown_provider',
        params: { provider: providerName }
      };
    }

    // Test all keys in parallel
    const testPromises = keys.map(async (key) => {
      try {
        const isValid = await testFunc(key);
        return { key, isValid };
      } catch (error) {
        logger.debug(`[ApiKeyManager] Key test failed for ${providerName}:`, error.message);
        return { key, isValid: false };
      }
    });

    const results = await Promise.all(testPromises);

    // Separate valid and invalid keys
    const valid = results.filter(r => r.isValid).map(r => r.key);
    const invalid = results.filter(r => !r.isValid).map(r => r.key);

    // Reorder: valid keys first, then invalid keys
    const reorderedKeys = [...valid, ...invalid];
    const keyString = this.stringifyKeys(reorderedKeys);
    await storageManager.set({ [providerSettingKey]: keyString });

    // Return message key and params for Vue component to translate
    const messageKey = valid.length > 0 ? 'api_test_result_partial' : 'api_test_result_all_invalid';
    const params = valid.length > 0
      ? { valid: valid.length, invalid: invalid.length }
      : { count: invalid.length };

    return {
      valid,
      invalid,
      allInvalid: valid.length === 0,
      messageKey,
      params
    };
  }

  /**
   * Test keys directly from provided value (without reading from storage)
   * @param {string} keysString - Keys string (one per line)
   * @param {string} providerName - Provider name for testing
   * @param {Object} [context={}] - Optional additional context (e.g., custom URL/Model)
   * @returns {Promise<Object>} - Test result with valid, invalid arrays and allInvalid flag
   */
  static async testKeysDirect(keysString, providerName, context = {}) {
    // Parse keys from string
    const keys = this.parseKeys(keysString);

    if (keys.length === 0) {
      return {
        valid: [],
        invalid: [],
        allInvalid: true,
        messageKey: 'api_test_no_keys'
      };
    }

    // Import provider classes dynamically
    const providerTests = {
      'OpenAI': async (key) => await this._testOpenAIKey(key, context),
      'Gemini': async (key) => await this._testGeminiKey(key, context),
      'DeepSeek': async (key) => await this._testDeepSeekKey(key, context),
      'OpenRouter': async (key) => await this._testOpenRouterKey(key, context),
      'DeepL': async (key) => await this._testDeepLKey(key),
      'Custom': async (key) => await this._testCustomKey(key, context)
    };

    const testFunc = providerTests[providerName];
    if (!testFunc) {
      return {
        valid: [],
        invalid: keys,
        allInvalid: true,
        messageKey: 'api_test_unknown_provider',
        params: { provider: providerName }
      };
    }

    // Test all keys in parallel
    const testPromises = keys.map(async (key) => {
      try {
        const isValid = await testFunc(key);
        return { key, isValid };
      } catch (error) {
        logger.debug(`[ApiKeyManager] Key test failed for ${providerName}:`, error.message);
        return { key, isValid: false };
      }
    });

    const results = await Promise.all(testPromises);

    // Separate valid and invalid keys
    const valid = results.filter(r => r.isValid).map(r => r.key);
    const invalid = results.filter(r => !r.isValid).map(r => r.key);

    // Return message key and params for Vue component to translate
    const messageKey = valid.length > 0 ? 'api_test_result_partial' : 'api_test_result_all_invalid';
    const params = valid.length > 0
      ? { valid: valid.length, invalid: invalid.length }
      : { count: invalid.length };

    return {
      valid,
      invalid,
      allInvalid: valid.length === 0,
      messageKey,
      params,
      reorderedString: [...valid, ...invalid].join('\n')
    };
  }

  /**
   * Test OpenAI API key
   * @param {string} key - API key to test
   * @param {Object} [context={}] - Optional context with URL
   * @returns {Promise<boolean>} - True if key is valid
   * @private
   */
  static async _testOpenAIKey(key, context = {}) {
    try {
      const apiUrl = context.apiUrl || 'https://api.openai.com/v1/models';
      const { proxyManager } = await import('@/shared/proxy/ProxyManager.js');
      const response = await proxyManager.fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Test Gemini API key
   * @param {string} key - API key to test
   * @param {Object} [context={}] - Optional context with URL
   * @returns {Promise<boolean>} - True if key is valid
   * @private
   */
  static async _testGeminiKey(key, context = {}) {
    try {
      let apiUrl = context.apiUrl || 'https://generativelanguage.googleapis.com/v1beta/models';
      
      // If a full endpoint was provided, try to get the base models URL
      if (apiUrl.includes(':generateContent')) {
        apiUrl = apiUrl.split(':generateContent')[0];
        // If it was a specific model URL like .../models/gemini-pro:generateContent
        // we want the parent .../models URL or just the models list
        if (apiUrl.includes('/models/')) {
          apiUrl = apiUrl.split('/models/')[0] + '/models';
        }
      } else if (!apiUrl.endsWith('/models') && !apiUrl.includes('/models/')) {
        // If it's just a base URL, append /models
        if (apiUrl.endsWith('/')) apiUrl += 'v1beta/models';
        else if (!apiUrl.includes('v1beta')) apiUrl += '/v1beta/models';
        else apiUrl += '/models';
      }
      
      const urlObj = new URL(apiUrl);
      urlObj.searchParams.set('key', key);
      
      const { proxyManager } = await import('@/shared/proxy/ProxyManager.js');
      const response = await proxyManager.fetch(urlObj.toString(), { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Test DeepSeek API key
   * @param {string} key - API key to test
   * @param {Object} [context={}] - Optional context with URL
   * @returns {Promise<boolean>} - True if key is valid
   * @private
   */
  static async _testDeepSeekKey(key, context = {}) {
    try {
      const apiUrl = context.apiUrl || 'https://api.deepseek.com/models';
      const { proxyManager } = await import('@/shared/proxy/ProxyManager.js');
      const response = await proxyManager.fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Test OpenRouter API key
   * @param {string} key - API key to test
   * @param {Object} [context={}] - Optional context with URL
   * @returns {Promise<boolean>} - True if key is valid
   * @private
   */
  static async _testOpenRouterKey(key, context = {}) {
    try {
      // Use auth/key endpoint instead of models to properly validate the key
      // models endpoint is public and may return 200 even for invalid keys
      const apiUrl = context.apiUrl || 'https://openrouter.ai/api/v1/auth/key';
      const { proxyManager } = await import('@/shared/proxy/ProxyManager.js');
      const response = await proxyManager.fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': 'https://github.com/iSegaro/Translate-It',
          'X-Title': 'Translate-It Extension'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Test DeepL API key
   * @param {string} key - API key to test
   * @returns {Promise<boolean>} - True if key is valid
   * @private
   */
  static async _testDeepLKey(key) {
    try {
      const { proxyManager } = await import('@/shared/proxy/ProxyManager.js');
      const response = await proxyManager.fetch('https://api-free.deepl.com/v2/usage', {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${key}`
        }
      });
      // Also check pro endpoint
      if (!response.ok) {
        const proResponse = await proxyManager.fetch('https://api.deepl.com/v2/usage', {
          method: 'POST',
          headers: {
            'Authorization': `DeepL-Auth-Key ${key}`
          }
        });
        return proResponse.ok;
      }
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Test Custom API key
   * For custom provider, we use the provided context or fallback to storage
   * @param {string} key - API key to test
   * @param {Object} [context={}] - Optional context with URL and Model
   * @returns {Promise<boolean>} - True if key is valid
   * @private
   */
  static async _testCustomKey(key, context = {}) {
    try {
      if (!key || key.trim() === '') return false;

      // Priority: use provided context values, fallback to storage
      let apiUrl = context.apiUrl;
      let apiModel = context.apiModel;

      if (!apiUrl) {
        const settings = await storageManager.get({
          CUSTOM_API_URL: '',
          CUSTOM_API_MODEL: ''
        });
        apiUrl = settings.CUSTOM_API_URL;
        apiModel = settings.CUSTOM_API_MODEL;
      }

      if (!apiUrl || apiUrl.trim() === '') {
        logger.warn('[ApiKeyManager] Custom API URL is not configured, cannot test key');
        return false;
      }

      // Try to determine models endpoint
      let modelsUrl = apiUrl;
      if (apiUrl.endsWith('/chat/completions')) {
        modelsUrl = apiUrl.replace('/chat/completions', '/models');
      } else if (apiUrl.endsWith('/v1/chat/completions')) {
        modelsUrl = apiUrl.replace('/v1/chat/completions', '/v1/models');
      }

      const { proxyManager } = await import('@/shared/proxy/ProxyManager.js');
      
      try {
        // Try models endpoint first
        const response = await proxyManager.fetch(modelsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${key}`
          }
        });

        if (response.ok) return true;
        
        // If models endpoint failed, try minimal chat completion
        if (response.status === 404 || response.status === 405) {
          const chatResponse = await proxyManager.fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: apiModel || 'gpt-3.5-turbo',
              messages: [{ role: 'user', content: 'hi' }],
              max_tokens: 1
            })
          });
          return chatResponse.ok;
        }

        return false;
      } catch (err) {
        logger.error('[ApiKeyManager] Custom API test error:', err);
        return false;
      }
    } catch (error) {
      logger.error('[ApiKeyManager] Custom API test failed:', error);
      return false;
    }
  }

  /**
   * Get provider name from provider code
   * @param {string} providerCode - Provider code (e.g., 'OPENAI')
   * @returns {string} - Provider display name
   */
  static getProviderName(providerCode) {
    return PROVIDER_NAMES[providerCode] || providerCode;
  }

  /**
   * Get settings key from provider code
   * @param {string} providerCode - Provider code (e.g., 'OPENAI')
   * @returns {string} - Settings key
   */
  static getSettingsKey(providerCode) {
    return PROVIDER_SETTINGS_KEYS[providerCode];
  }
}

export { ApiKeyManager };
