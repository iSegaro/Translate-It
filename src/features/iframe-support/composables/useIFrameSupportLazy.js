/**
 * Lazy Loading IFrame Support Composable
 * Provides lazy-loaded IFrame Support functionality with caching
 */

import { ref, computed } from 'vue';
import { IFrameSupportFactory } from '../IFrameSupportFactory.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.IFRAME, 'useIFrameSupportLazy');

export function useIFrameSupportLazy() {
  const isLoading = ref(false);
  const loadError = ref(null);
  const loadedModules = ref(new Set());

  // Track what's loaded
  const isManagerLoaded = computed(() => loadedModules.value.has('IFrameManager'));
  const isRegistryLoaded = computed(() => loadedModules.value.has('FrameRegistry'));
  const isComposablesLoaded = computed(() => loadedModules.value.has('IFrameComposables'));

  /**
   * Load IFrame Manager
   */
  const loadIFrameManager = async () => {
    if (isManagerLoaded.value) {
      logger.debug('[useIFrameSupportLazy] IFrameManager already loaded');
      return IFrameSupportFactory.cache.get('IFrameManager');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useIFrameSupportLazy] Loading IFrameManager...');
      const manager = await IFrameSupportFactory.getIFrameManager();
      loadedModules.value.add('IFrameManager');
      logger.debug('[useIFrameSupportLazy] IFrameManager loaded successfully');
      return manager;
    } catch (error) {
      logger.error('[useIFrameSupportLazy] Failed to load IFrameManager:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load Frame Registry
   */
  const loadFrameRegistry = async () => {
    if (isRegistryLoaded.value) {
      logger.debug('[useIFrameSupportLazy] FrameRegistry already loaded');
      return IFrameSupportFactory.cache.get('FrameRegistry');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useIFrameSupportLazy] Loading FrameRegistry...');
      const registry = await IFrameSupportFactory.getFrameRegistry();
      loadedModules.value.add('FrameRegistry');
      logger.debug('[useIFrameSupportLazy] FrameRegistry loaded successfully');
      return registry;
    } catch (error) {
      logger.error('[useIFrameSupportLazy] Failed to load FrameRegistry:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load IFrame Composables
   */
  const loadIFrameComposables = async () => {
    if (isComposablesLoaded.value) {
      logger.debug('[useIFrameSupportLazy] IFrame composables already loaded');
      return IFrameSupportFactory.cache.get('IFrameComposables');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useIFrameSupportLazy] Loading IFrame composables...');
      const composables = await IFrameSupportFactory.getIFrameComposables();
      loadedModules.value.add('IFrameComposables');
      logger.debug('[useIFrameSupportLazy] IFrame composables loaded successfully');
      return composables;
    } catch (error) {
      logger.error('[useIFrameSupportLazy] Failed to load IFrame composables:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Convenience method to load core IFrame functionality
   */
  const loadIFrameCore = async () => {
    logger.debug('[useIFrameSupportLazy] Loading core IFrame modules...');

    const [manager, registry, composables] = await Promise.all([
      loadIFrameManager(),
      loadFrameRegistry(),
      loadIFrameComposables()
    ]);

    return {
      ...manager,
      FrameRegistry: registry,
      ...composables
    };
  };

  /**
   * Create an IFrame Manager instance with lazy loading
   */
  const createIFrameManager = async () => {
    const { IFrameManager } = await loadIFrameManager();
    return new IFrameManager();
  };

  /**
   * Get the singleton IFrame Manager instance
   */
  const getIFrameManager = async () => {
    const { iFrameManager } = await loadIFrameManager();
    return iFrameManager;
  };

  /**
   * Create Frame Registry instance with lazy loading
   */
  const createFrameRegistry = async () => {
    const FrameRegistry = await loadFrameRegistry();
    return new FrameRegistry();
  };

  /**
   * Clear all loaded modules and cache
   */
  const clearCache = () => {
    logger.debug('[useIFrameSupportLazy] Clearing IFrame Support cache...');
    IFrameSupportFactory.clearCache();
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
      factoryStats: IFrameSupportFactory.getCacheStats()
    };
  };

  return {
    // Loading state
    isLoading: computed(() => isLoading.value),
    loadError: computed(() => loadError.value),

    // Module status
    isManagerLoaded,
    isRegistryLoaded,
    isComposablesLoaded,

    // Loading functions
    loadIFrameManager,
    loadFrameRegistry,
    loadIFrameComposables,
    loadIFrameCore,

    // Instance creation
    createIFrameManager,
    getIFrameManager,
    createFrameRegistry,

    // Maintenance
    clearCache,
    getStats
  };
}

export default useIFrameSupportLazy;