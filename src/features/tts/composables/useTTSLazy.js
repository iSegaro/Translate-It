/**
 * Lazy Loading TTS Composable
 * Provides lazy-loaded TTS functionality with caching
 */

import { ref, computed } from 'vue';
import { TTSFactory } from '../TTSFactory.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'useTTSLazy');

export function useTTSLazy() {
  const isLoading = ref(false);
  const loadError = ref(null);
  const loadedModules = ref(new Set());

  // Track what's loaded
  const isTTSSmartLoaded = computed(() => loadedModules.value.has('useTTSSmart'));
  const isTTSGlobalLoaded = computed(() => loadedModules.value.has('TTSGlobalManager'));
  const isTTSHandlersLoaded = computed(() => loadedModules.value.has('TTSHandlers'));

  /**
   * Load TTS Smart composable
   */
  const loadTTSSmart = async () => {
    if (isTTSSmartLoaded.value) {
      logger.debug('[useTTSLazy] useTTSSmart already loaded');
      return TTSFactory.cache.get('useTTSSmart');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useTTSLazy] Loading useTTSSmart...');
      const useTTSSmart = await TTSFactory.getTTSSmart();
      loadedModules.value.add('useTTSSmart');
      logger.debug('[useTTSLazy] useTTSSmart loaded successfully');
      return useTTSSmart;
    } catch (error) {
      logger.error('[useTTSLazy] Failed to load useTTSSmart:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load TTS Global Manager
   */
  const loadTTSGlobal = async () => {
    if (isTTSGlobalLoaded.value) {
      logger.debug('[useTTSLazy] TTSGlobalManager already loaded');
      return TTSFactory.cache.get('TTSGlobalManager');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useTTSLazy] Loading TTSGlobalManager...');
      const ttsGlobal = await TTSFactory.getTTSGlobal();
      loadedModules.value.add('TTSGlobalManager');
      logger.debug('[useTTSLazy] TTSGlobalManager loaded successfully');
      return ttsGlobal;
    } catch (error) {
      logger.error('[useTTSLazy] Failed to load TTSGlobalManager:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Load TTS Handlers (for background script)
   */
  const loadTTSHandlers = async () => {
    if (isTTSHandlersLoaded.value) {
      logger.debug('[useTTSLazy] TTS handlers already loaded');
      return TTSFactory.cache.get('TTSHandlers');
    }

    isLoading.value = true;
    loadError.value = null;

    try {
      logger.debug('[useTTSLazy] Loading TTS handlers...');
      const handlers = await TTSFactory.getTTSHandlers();
      loadedModules.value.add('TTSHandlers');
      logger.debug('[useTTSLazy] TTS handlers loaded successfully');
      return handlers;
    } catch (error) {
      logger.error('[useTTSLazy] Failed to load TTS handlers:', error);
      loadError.value = error;
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Convenience method to load commonly used TTS functionality
   */
  const loadTTSCore = async () => {
    logger.debug('[useTTSLazy] Loading core TTS modules...');

    const [useTTSSmart, ttsGlobal] = await Promise.all([
      loadTTSSmart(),
      loadTTSGlobal()
    ]);

    return {
      useTTSSmart,
      useTTSGlobal: ttsGlobal.useTTSGlobal,
      TTSGlobalManager: ttsGlobal.TTSGlobalManager
    };
  };

  /**
   * Create a TTS Smart instance with lazy loading
   */
  const createTTSSmartInstance = async () => {
    const useTTSSmart = await loadTTSSmart();
    return useTTSSmart();
  };

  /**
   * Create a TTS Global instance with lazy loading
   */
  const createTTSGlobalInstance = async (componentInfo = {}) => {
    const ttsGlobal = await loadTTSGlobal();
    return ttsGlobal.useTTSGlobal(componentInfo);
  };

  /**
   * Clear all loaded modules and cache
   */
  const clearCache = () => {
    logger.debug('[useTTSLazy] Clearing TTS cache...');
    TTSFactory.clearCache();
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
      factoryStats: TTSFactory.getCacheStats()
    };
  };

  return {
    // Loading state
    isLoading: computed(() => isLoading.value),
    loadError: computed(() => loadError.value),

    // Module status
    isTTSSmartLoaded,
    isTTSGlobalLoaded,
    isTTSHandlersLoaded,

    // Loading functions
    loadTTSSmart,
    loadTTSGlobal,
    loadTTSHandlers,
    loadTTSCore,

    // Instance creation
    createTTSSmartInstance,
    createTTSGlobalInstance,

    // Maintenance
    clearCache,
    getStats
  };
}

export default useTTSLazy;