/**
 * IFrame Support Factory - Dynamic Loading and Caching
 * Manages lazy loading and caching of IFrame Support modules for optimal performance
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.IFRAME, 'IFrameSupportFactory');

class IFrameSupportFactory {
  constructor() {
    this.cache = new Map();
    this.loadingPromises = new Map();
  }

  /**
   * Get IFrame Manager (most commonly used)
   */
  async getIFrameManager() {
    const cacheKey = 'IFrameManager';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    logger.debug('[IFrameSupportFactory] Loading IFrameManager...');

    const loadingPromise = import('./managers/IFrameManager.js').then(module => {
      const result = {
        IFrameManager: module.IFrameManager,
        iFrameManager: module.iFrameManager
      };
      this.cache.set(cacheKey, result);
      this.loadingPromises.delete(cacheKey);
      logger.debug('[IFrameSupportFactory] IFrameManager loaded and cached');
      return result;
    }).catch(error => {
      logger.error('[IFrameSupportFactory] Failed to load IFrameManager:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Get Frame Registry
   */
  async getFrameRegistry() {
    const cacheKey = 'FrameRegistry';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    logger.debug('[IFrameSupportFactory] Loading FrameRegistry...');

    const loadingPromise = import('../windows/managers/crossframe/FrameRegistry.js').then(module => {
      const result = module.FrameRegistry;
      this.cache.set(cacheKey, result);
      this.loadingPromises.delete(cacheKey);
      logger.debug('[IFrameSupportFactory] FrameRegistry loaded and cached');
      return result;
    }).catch(error => {
      logger.error('[IFrameSupportFactory] Failed to load FrameRegistry:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Get IFrame Composables
   */
  async getIFrameComposables() {
    const cacheKey = 'IFrameComposables';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    logger.debug('[IFrameSupportFactory] Loading IFrame composables...');

    const loadingPromise = import('./composables/useIFrameSupport.js').then(module => {
      const result = {
        useIFrameSupport: module.useIFrameSupport,
        useIFrameDetection: module.useIFrameDetection,
        useIFramePositioning: module.useIFramePositioning
      };
      this.cache.set(cacheKey, result);
      this.loadingPromises.delete(cacheKey);
      logger.debug('[IFrameSupportFactory] IFrame composables loaded and cached');
      return result;
    }).catch(error => {
      logger.error('[IFrameSupportFactory] Failed to load IFrame composables:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Get all IFrame core modules
   */
  async getIFrameCore() {
    const [manager, registry, composables] = await Promise.all([
      this.getIFrameManager(),
      this.getFrameRegistry(),
      this.getIFrameComposables()
    ]);

    return {
      ...manager,
      FrameRegistry: registry,
      ...composables
    };
  }

  /**
   * Clear cache for testing or memory management
   */
  clearCache() {
    logger.debug('[IFrameSupportFactory] Clearing IFrame Support cache');
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
const iframeSupportFactory = new IFrameSupportFactory();

export { iframeSupportFactory as IFrameSupportFactory };
export default iframeSupportFactory;