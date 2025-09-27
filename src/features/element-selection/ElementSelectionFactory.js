/**
 * Element Selection Factory - Dynamic Loading and Caching
 * Manages lazy loading and caching of Element Selection modules for optimal performance
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
      const manager = module.default || module.SelectElementManager;
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
   * Get Element Selection Services
   */
  async getElementSelectionServices() {
    const cacheKey = 'ElementSelectionServices';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    logger.debug('[ElementSelectionFactory] Loading Element Selection services...');

    const loadingPromise = Promise.all([
      import('./managers/services/ElementHighlighter.js'),
      import('./managers/services/TextExtractionService.js'),
      import('./managers/services/TranslationOrchestrator.js'),
      import('./managers/services/ModeManager.js'),
      import('./managers/services/StateManager.js'),
      import('./managers/services/ErrorHandlingService.js')
    ]).then(([highlighter, extractor, orchestrator, modeManager, stateManager, errorHandler]) => {
      const result = {
        ElementHighlighter: highlighter.ElementHighlighter,
        TextExtractionService: extractor.TextExtractionService,
        TranslationOrchestrator: orchestrator.TranslationOrchestrator,
        ModeManager: modeManager.ModeManager,
        StateManager: stateManager.StateManager,
        ErrorHandlingService: errorHandler.ErrorHandlingService
      };
      this.cache.set(cacheKey, result);
      this.loadingPromises.delete(cacheKey);
      logger.debug('[ElementSelectionFactory] Element Selection services loaded and cached');
      return result;
    }).catch(error => {
      logger.error('[ElementSelectionFactory] Failed to load Element Selection services:', error);
      this.loadingPromises.delete(cacheKey);
      throw error;
    });

    this.loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }

  /**
   * Get Element Highlighter specifically (commonly used standalone)
   */
  async getElementHighlighter() {
    const cacheKey = 'ElementHighlighter';

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    logger.debug('[ElementSelectionFactory] Loading ElementHighlighter...');

    const loadingPromise = import('./managers/services/ElementHighlighter.js').then(module => {
      const highlighter = module.ElementHighlighter;
      this.cache.set(cacheKey, highlighter);
      this.loadingPromises.delete(cacheKey);
      logger.debug('[ElementSelectionFactory] ElementHighlighter loaded and cached');
      return highlighter;
    }).catch(error => {
      logger.error('[ElementSelectionFactory] Failed to load ElementHighlighter:', error);
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