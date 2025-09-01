/**
 * useStorageItem - Vue composable for single storage item management
 * Provides reactive operations for individual storage keys with automatic sync
 */

import { ref, watch, onMounted, onUnmounted } from "vue";
import { storageCore } from "../core/StorageCore.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.STORAGE, 'useStorageItem');

/**
 * Vue composable for single storage item operations
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @param {Object} options - Configuration options
 * @returns {Object} Storage item operations and reactive data
 */
export function useStorageItem(key, defaultValue = null, options = {}) {
  const {
    immediate = true,
    useCache = true,
    autoSave = true,
    debounceMs = 500
  } = options;

  // Reactive state
  const value = ref(defaultValue);
  const isLoading = ref(false);
  const error = ref(null);
  const isSaving = ref(false);

  // Internal state
  let changeListener = null;
  let debounceTimer = null;
  let isInternalUpdate = false;

  /**
   * Load value from storage
   */
  const load = async () => {
    if (!key) {
      error.value = "Storage key is required";
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const result = await storageCore.get({ [key]: defaultValue }, useCache);
      
      isInternalUpdate = true;
      value.value = result[key];
      isInternalUpdate = false;

      logger.debug(`[useStorageItem] Loaded '${key}':`, result[key]);
    } catch (err) {
      error.value = err.message;
      logger.error(`[useStorageItem] Load failed for key '${key}':`, err);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Save value to storage
   */
  const save = async (newValue = value.value) => {
    if (!key) {
      error.value = "Storage key is required";
      return;
    }

    isSaving.value = true;
    error.value = null;

    try {
      await storageCore.set({ [key]: newValue });
      
      isInternalUpdate = true;
      value.value = newValue;
      isInternalUpdate = false;

      logger.debug(`[useStorageItem] Saved '${key}':`, newValue);
    } catch (err) {
      error.value = err.message;
      logger.error(`[useStorageItem] Save failed for key '${key}':`, err);
      throw err;
    } finally {
      isSaving.value = false;
    }
  };

  /**
   * Remove item from storage
   */
  const remove = async () => {
    if (!key) {
      error.value = "Storage key is required";
      return;
    }

    isSaving.value = true;
    error.value = null;

    try {
      await storageCore.remove(key);
      
      isInternalUpdate = true;
      value.value = defaultValue;
      isInternalUpdate = false;

      logger.debug(`[useStorageItem] Removed '${key}'`);
    } catch (err) {
      error.value = err.message;
      logger.error(`[useStorageItem] Remove failed for key '${key}':`, err);
      throw err;
    } finally {
      isSaving.value = false;
    }
  };

  /**
   * Reset to default value
   */
  const reset = async () => {
    if (autoSave) {
      await save(defaultValue);
    } else {
      isInternalUpdate = true;
      value.value = defaultValue;
      isInternalUpdate = false;
    }
  };

  /**
   * Get cached value synchronously
   */
  const getCached = (fallback = defaultValue) => {
    return storageCore.getCached(key, fallback);
  };

  /**
   * Check if key exists in cache
   */
  const hasCached = () => {
    return storageCore.hasCached(key);
  };

  /**
   * Setup change listener for external updates
   */
  const setupListener = () => {
    if (!key) return;

    changeListener = ({ newValue }) => {
      // Only update if this wasn't an internal change
      if (!isInternalUpdate) {
        value.value = newValue !== undefined ? newValue : defaultValue;
        logger.debug(`[useStorageItem] External change detected for '${key}':`, newValue);
      }
    };

    storageCore.on(`change:${key}`, changeListener);
  };

  /**
   * Cleanup listener
   */
  const cleanup = () => {
    if (changeListener && key) {
      storageCore.off(`change:${key}`, changeListener);
      changeListener = null;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  /**
   * Debounced save function
   */
  const debouncedSave = (newValue) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      try {
        await save(newValue);
      } catch {
        // Error already handled in save method
      }
    }, debounceMs);
  };

  // Watch for value changes to auto-save
  let stopWatcher = null;
  if (autoSave) {
    stopWatcher = watch(
      value,
      (newValue, oldValue) => {
        // Skip if this is an internal update or loading
        if (isInternalUpdate || isLoading.value) return;
        
        // Skip if values are the same
        if (JSON.stringify(newValue) === JSON.stringify(oldValue)) return;

        if (debounceMs > 0) {
          debouncedSave(newValue);
        } else {
          save(newValue).catch(() => {
            // Error already handled in save method
          });
        }
      },
      { deep: true }
    );
  }

  // Lifecycle
  onMounted(async () => {
    setupListener();
    
    if (immediate && key) {
      await load();
    }
  });

  onUnmounted(() => {
    cleanup();
    if (stopWatcher) {
      stopWatcher();
    }
  });

  return {
    // State
    value,
    isLoading,
    error,
    isSaving,

    // Methods
    load,
    save,
    remove,
    reset,
    getCached,
    hasCached,

    // Utilities
    cleanup,
    key: ref(key),
    defaultValue: ref(defaultValue)
  };
}

export default useStorageItem;