/**
 * Lazy Loading Element Selection Composable
 * Simplified for the new domtranslator-based architecture
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
  const isSelectorLoaded = computed(() => loadedModules.value.has('ElementSelector'));
  const isAdapterLoaded = computed(() => loadedModules.value.has('DomTranslatorAdapter'));

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
   * Load Element Selector
   */
  const loadElementSelector = async () => {
    if (isSelectorLoaded.value) {
      logger.debug('[useElementSelectionLazy] ElementSelector already loaded');
      return ElementSelectionFactory.cache.get('ElementSelector');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useElementSelectionLazy] Loading ElementSelector...');
      const selector = await ElementSelectionFactory.getElementSelector();
      loadedModules.value.add('ElementSelector');
      logger.debug('[useElementSelectionLazy] ElementSelector loaded successfully');
      return selector;
    } catch (error) {
      logger.error('[useElementSelectionLazy] Failed to load ElementSelector:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load DomTranslator Adapter
   */
  const loadDomTranslatorAdapter = async () => {
    if (isAdapterLoaded.value) {
      logger.debug('[useElementSelectionLazy] DomTranslatorAdapter already loaded');
      return ElementSelectionFactory.cache.get('DomTranslatorAdapter');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useElementSelectionLazy] Loading DomTranslatorAdapter...');
      const adapter = await ElementSelectionFactory.getDomTranslatorAdapter();
      loadedModules.value.add('DomTranslatorAdapter');
      logger.debug('[useElementSelectionLazy] DomTranslatorAdapter loaded successfully');
      return adapter;
    } catch (error) {
      logger.error('[useElementSelectionLazy] Failed to load DomTranslatorAdapter:', error);
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

    const [manager, selector, adapter] = await Promise.all([
      loadSelectElementManager(),
      loadElementSelector(),
      loadDomTranslatorAdapter()
    ]);

    return {
      SelectElementManager: manager,
      ElementSelector: selector,
      DomTranslatorAdapter: adapter
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
   * Create an Element Selector instance with lazy loading
   */
  const createElementSelector = async () => {
    const SelectorClass = await loadElementSelector();
    return new SelectorClass();
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
    isSelectorLoaded,
    isAdapterLoaded,

    // Loading functions
    loadSelectElementManager,
    loadElementSelectionHandlers,
    loadElementSelector,
    loadDomTranslatorAdapter,
    loadElementSelectionCore,

    // Instance creation
    createSelectElementManager,
    createElementSelector,

    // Maintenance
    clearCache,
    getStats
  };
}

export default useElementSelectionLazy;
