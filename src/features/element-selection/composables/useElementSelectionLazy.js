/**
 * Lazy Loading Element Selection Composable
 * Provides lazy-loaded Element Selection functionality with caching
 */

import { ref, computed } from 'vue';
import { ElementSelectionFactory } from '../ElementSelectionFactory.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'useElementSelectionLazy');

export function useElementSelectionLazy() {
  const isLoading = ref(false);
  const loadError = ref(null);
  const loadedModules = ref(new Set());

  // Track what's loaded
  const isManagerLoaded = computed(() => loadedModules.value.has('SelectElementManager'));
  const isHandlersLoaded = computed(() => loadedModules.value.has('ElementSelectionHandlers'));
  const isServicesLoaded = computed(() => loadedModules.value.has('ElementSelectionServices'));
  const isHighlighterLoaded = computed(() => loadedModules.value.has('ElementHighlighter'));

  /**
   * Load Element Selection Manager
   */
  const loadSelectElementManager = async () => {
    if (isManagerLoaded.value) {
      logger.debug('[useElementSelectionLazy] SelectElementManager already loaded');
      return ElementSelectionFactory.cache.get('SelectElementManager');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useElementSelectionLazy] Loading SelectElementManager...');
      const manager = await ElementSelectionFactory.getSelectElementManager();
      loadedModules.value.add('SelectElementManager');
      logger.debug('[useElementSelectionLazy] SelectElementManager loaded successfully');
      return manager;
    } catch (error) {
      logger.error('[useElementSelectionLazy] Failed to load SelectElementManager:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load Element Selection Handlers (for background script)
   */
  const loadElementSelectionHandlers = async () => {
    if (isHandlersLoaded.value) {
      logger.debug('[useElementSelectionLazy] Element Selection handlers already loaded');
      return ElementSelectionFactory.cache.get('ElementSelectionHandlers');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useElementSelectionLazy] Loading Element Selection handlers...');
      const handlers = await ElementSelectionFactory.getElementSelectionHandlers();
      loadedModules.value.add('ElementSelectionHandlers');
      logger.debug('[useElementSelectionLazy] Element Selection handlers loaded successfully');
      return handlers;
    } catch (error) {
      logger.error('[useElementSelectionLazy] Failed to load Element Selection handlers:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load Element Selection Services
   */
  const loadElementSelectionServices = async () => {
    if (isServicesLoaded.value) {
      logger.debug('[useElementSelectionLazy] Element Selection services already loaded');
      return ElementSelectionFactory.cache.get('ElementSelectionServices');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useElementSelectionLazy] Loading Element Selection services...');
      const services = await ElementSelectionFactory.getElementSelectionServices();
      loadedModules.value.add('ElementSelectionServices');
      logger.debug('[useElementSelectionLazy] Element Selection services loaded successfully');
      return services;
    } catch (error) {
      logger.error('[useElementSelectionLazy] Failed to load Element Selection services:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load Element Highlighter specifically
   */
  const loadElementHighlighter = async () => {
    if (isHighlighterLoaded.value) {
      logger.debug('[useElementSelectionLazy] ElementHighlighter already loaded');
      return ElementSelectionFactory.cache.get('ElementHighlighter');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useElementSelectionLazy] Loading ElementHighlighter...');
      const highlighter = await ElementSelectionFactory.getElementHighlighter();
      loadedModules.value.add('ElementHighlighter');
      logger.debug('[useElementSelectionLazy] ElementHighlighter loaded successfully');
      return highlighter;
    } catch (error) {
      logger.error('[useElementSelectionLazy] Failed to load ElementHighlighter:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Convenience method to load core Element Selection functionality
   */
  const loadElementSelectionCore = async () => {
    logger.debug('[useElementSelectionLazy] Loading core Element Selection modules...');

    const [manager, services, highlighter] = await Promise.all([
      loadSelectElementManager(),
      loadElementSelectionServices(),
      loadElementHighlighter()
    ]);

    return {
      SelectElementManager: manager,
      services,
      ElementHighlighter: highlighter
    };
  };

  /**
   * Create a Select Element Manager instance with lazy loading
   */
  const createSelectElementManager = async () => {
    const ManagerClass = await loadSelectElementManager();
    return new ManagerClass();
  };

  /**
   * Create an Element Highlighter instance with lazy loading
   */
  const createElementHighlighter = async () => {
    const HighlighterClass = await loadElementHighlighter();
    return new HighlighterClass();
  };

  /**
   * Clear all loaded modules and cache
   */
  const clearCache = () => {
    logger.debug('[useElementSelectionLazy] Clearing Element Selection cache...');
    ElementSelectionFactory.clearCache();
    loadedModules.value.clear();
    loadError.value = null;
  };

  /**
   * Get statistics about loaded modules
   */
  const getStats = () => {
    return {
      isLoading: isLoading.value,
      loadError: loadError.value,
      loadedModules: Array.from(loadedModules.value),
      factoryStats: ElementSelectionFactory.getCacheStats()
    };
  };

  return {
    // Loading state
    isLoading: computed(() => isLoading.value),
    loadError: computed(() => loadError.value),

    // Module status
    isManagerLoaded,
    isHandlersLoaded,
    isServicesLoaded,
    isHighlighterLoaded,

    // Loading functions
    loadSelectElementManager,
    loadElementSelectionHandlers,
    loadElementSelectionServices,
    loadElementHighlighter,
    loadElementSelectionCore,

    // Instance creation
    createSelectElementManager,
    createElementHighlighter,

    // Maintenance
    clearCache,
    getStats
  };
}

export default useElementSelectionLazy;