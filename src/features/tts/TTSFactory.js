/**
 * TTS Factory - Dynamic Loading and Caching
 * Manages lazy loading and caching of TTS modules for optimal performance
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSFactory');

class TTSFactory {
  constructor() {
    this.cache = new Map();
    this.loadingPromises = new Map();
  }

  /**
   * Get TTS Smart composable (most commonly used)
   */
  async getTTSSmart() {
    const cacheKey = 'useTTSSmart';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    // Loading useTTSSmart - logged at TRACE level for detailed debugging
    // logger.debug('[TTSFactory] Loading useTTSSmart...');

    const loadingPromise = import('./composables/useTTSSmart.js').then(module => {
      const composable = module.useTTSSmart;
      this.cache.set(cacheKey, composable);
      this.loadingPromises.delete(cacheKey);
      logger.info('[TTSFactory] useTTSSmart loaded successfully');
      return composable;
    }).catch(error => {
      logger.error('[TTSFactory] Failed to load useTTSSmart:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Get TTS Global Manager
   */
  async getTTSGlobal() {
    const cacheKey = 'TTSGlobalManager';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    // Loading TTSGlobalManager - logged at TRACE level for detailed debugging
    // logger.debug('[TTSFactory] Loading TTSGlobalManager...');

    const loadingPromise = import('./core/TTSGlobalManager.js').then(module => {
      const result = {
        TTSGlobalManager: module.TTSGlobalManager,
        useTTSGlobal: module.useTTSGlobal
      };
      this.cache.set(cacheKey, result);
      this.loadingPromises.delete(cacheKey);
      logger.info('[TTSFactory] TTSGlobalManager loaded successfully');
      return result;
    }).catch(error => {
      logger.error('[TTSFactory] Failed to load TTSGlobalManager:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Get TTS Handlers (background script usage)
   */
  async getTTSHandlers() {
    const cacheKey = 'TTSHandlers';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    // Loading TTS handlers - logged at TRACE level for detailed debugging
    // logger.debug('[TTSFactory] Loading TTS handlers...');

    const loadingPromise = Promise.all([
      import('./handlers/handleGoogleTTS.js'),
      import('./handlers/handleOffscreenReady.js')
    ]).then(([googleTTS, offscreenReady]) => {
      const result = {
        handleGoogleTTSSpeak: googleTTS.handleGoogleTTSSpeak,
        handleOffscreenReady: offscreenReady.handleOffscreenReady
      };
      this.cache.set(cacheKey, result);
      this.loadingPromises.delete(cacheKey);
      logger.info('[TTSFactory] TTS handlers loaded successfully');
      return result;
    }).catch(error => {
      logger.error('[TTSFactory] Failed to load TTS handlers:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Get Browser API utilities
   */
  async getBrowserAPI() {
    const cacheKey = 'BrowserAPI';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    // Loading Browser API - logged at TRACE level for detailed debugging
    // logger.debug('[TTSFactory] Loading Browser API...');

    const loadingPromise = import('./core/useBrowserAPI.js').then(module => {
      const result = module.useBrowserAPI;
      this.cache.set(cacheKey, result);
      this.loadingPromises.delete(cacheKey);
      logger.info('[TTSFactory] Browser API loaded successfully');
      return result;
    }).catch(error => {
      logger.error('[TTSFactory] Failed to load Browser API:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Clear cache for testing or memory management
   */
  clearCache() {
    // Clearing TTS cache - logged at TRACE level for detailed debugging
    // logger.debug('[TTSFactory] Clearing TTS cache');
    this.cache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cachedModules: Array.from(this.cache.keys()),
      loadingModules: Array.from(this.loadingPromises.keys()),
      cacheSize: this.cache.size
    };
  }
}

// Create singleton instance
const ttsFactory = new TTSFactory();

export { ttsFactory as TTSFactory };
export default ttsFactory;