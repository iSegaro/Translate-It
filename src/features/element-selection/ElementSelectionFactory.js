/**
 * Element Selection Factory - Dynamic Loading and Caching
 * Simplified for the new domtranslator-based architecture
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'ElementSelectionFactory');

class ElementSelectionFactory {
  constructor() {
    this.cache = new Map();
    this.loadingPromises = new Map();
  }

  /**
   * Get Element Selection Manager (most commonly used)
   */
  async getSelectElementManager() {
    const cacheKey = 'SelectElementManager';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    logger.debug('[ElementSelectionFactory] Loading SelectElementManager...');

    const loadingPromise = import('./SelectElementManager.js').then(module => {
      const manager = module.SelectElementManager;
      this.cache.set(cacheKey, manager);
      this.loadingPromises.delete(cacheKey);
      logger.debug('[ElementSelectionFactory] SelectElementManager loaded and cached');
      return manager;
    }).catch(error => {
      logger.error('[ElementSelectionFactory] Failed to load SelectElementManager:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Get Element Selection Handlers (background script usage)
   */
  async getElementSelectionHandlers() {
    const cacheKey = 'ElementSelectionHandlers';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    logger.debug('[ElementSelectionFactory] Loading Element Selection handlers...');

    const loadingPromise = Promise.all([
      import('./handlers/handleActivateSelectElementMode.js'),
      import('./handlers/handleDeactivateSelectElementMode.js'),
      import('./handlers/handleGetSelectElementState.js'),
      import('./handlers/handleSetSelectElementState.js')
    ]).then(([activate, deactivate, getState, setState]) => {
      const result = {
        handleActivateSelectElementMode: activate.handleActivateSelectElementMode,
        handleDeactivateSelectElementMode: deactivate.handleDeactivateSelectElementMode,
        handleGetSelectElementState: getState.handleGetSelectElementState,
        handleSetSelectElementState: setState.handleSetSelectElementState
      };
      this.cache.set(cacheKey, result);
      this.loadingPromises.delete(cacheKey);
      logger.debug('[ElementSelectionFactory] Element Selection handlers loaded and cached');
      return result;
    }).catch(error => {
      logger.error('[ElementSelectionFactory] Failed to load Element Selection handlers:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Get Element Selector (new simplified service)
   */
  async getElementSelector() {
    const cacheKey = 'ElementSelector';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    logger.debug('[ElementSelectionFactory] Loading ElementSelector...');

    const loadingPromise = import('./core/ElementSelector.js').then(module => {
      const selector = module.ElementSelector;
      this.cache.set(cacheKey, selector);
      this.loadingPromises.delete(cacheKey);
      logger.debug('[ElementSelectionFactory] ElementSelector loaded and cached');
      return selector;
    }).catch(error => {
      logger.error('[ElementSelectionFactory] Failed to load ElementSelector:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Get DomTranslator Adapter (new simplified service)
   */
  async getDomTranslatorAdapter() {
    const cacheKey = 'DomTranslatorAdapter';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    logger.debug('[ElementSelectionFactory] Loading DomTranslatorAdapter...');

    const loadingPromise = import('./core/DomTranslatorAdapter.js').then(module => {
      const adapter = module.DomTranslatorAdapter;
      this.cache.set(cacheKey, adapter);
      this.loadingPromises.delete(cacheKey);
      logger.debug('[ElementSelectionFactory] DomTranslatorAdapter loaded and cached');
      return adapter;
    }).catch(error => {
      logger.error('[ElementSelectionFactory] Failed to load DomTranslatorAdapter:', error);
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
    logger.debug('[ElementSelectionFactory] Clearing Element Selection cache');
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
const elementSelectionFactory = new ElementSelectionFactory();

export { elementSelectionFactory as ElementSelectionFactory };
export default elementSelectionFactory;
