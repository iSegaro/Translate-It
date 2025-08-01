/**
 * useStorage - Vue composable for centralized storage management
 * Provides reactive storage operations with automatic cache management
 */

import { ref, reactive, onMounted, onUnmounted, watch } from "vue";
import storageManager from "../core/StorageManager.js";

/**
 * Vue composable for storage operations
 * @param {string|string[]|Object} keys - Initial keys to load
 * @param {Object} options - Configuration options
 * @returns {Object} Storage operations and reactive data
 */
export function useStorage(keys = null, options = {}) {
  const {
    immediate = true,
    useCache = true,
    reactive: makeReactive = true
  } = options;

  // Reactive state
  const isLoading = ref(false);
  const error = ref(null);
  const data = makeReactive ? reactive({}) : ref({});

  // Event listeners to cleanup
  const listeners = [];

  /**
   * Load data from storage
   */
  const load = async (keysToLoad = keys) => {
    if (!keysToLoad) return;

    isLoading.value = true;
    error.value = null;

    try {
      const result = await storageManager.get(keysToLoad, useCache);
      
      if (makeReactive) {
        // Update reactive object
        Object.assign(data, result);
      } else {
        data.value = result;
      }

      console.log(`[useStorage] Loaded ${Object.keys(result).length} key(s)`);
    } catch (err) {
      error.value = err.message;
      console.error("[useStorage] Load failed:", err);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Save data to storage
   */
  const save = async (dataToSave) => {
    if (!dataToSave || typeof dataToSave !== "object") {
      throw new Error("Data must be an object");
    }

    isLoading.value = true;
    error.value = null;

    try {
      await storageManager.set(dataToSave);
      
      if (makeReactive) {
        // Update reactive object
        Object.assign(data, dataToSave);
      } else {
        data.value = { ...data.value, ...dataToSave };
      }

      console.log(`[useStorage] Saved ${Object.keys(dataToSave).length} key(s)`);
    } catch (err) {
      error.value = err.message;
      console.error("[useStorage] Save failed:", err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Remove keys from storage
   */
  const remove = async (keysToRemove) => {
    const keyList = Array.isArray(keysToRemove) ? keysToRemove : [keysToRemove];

    isLoading.value = true;
    error.value = null;

    try {
      await storageManager.remove(keyList);
      
      // Remove from reactive data
      for (const key of keyList) {
        if (makeReactive) {
          delete data[key];
        } else {
          const newData = { ...data.value };
          delete newData[key];
          data.value = newData;
        }
      }

      console.log(`[useStorage] Removed ${keyList.length} key(s)`);
    } catch (err) {
      error.value = err.message;
      console.error("[useStorage] Remove failed:", err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Update a single key
   */
  const update = async (key, value) => {
    await save({ [key]: value });
  };

  /**
   * Get cached value synchronously
   */
  const getCached = (key, defaultValue) => {
    return storageManager.getCached(key, defaultValue);
  };

  /**
   * Setup storage change listeners
   */
  const setupListeners = () => {
    if (!keys) return;

    const keyList = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys);

    // Listen for specific key changes
    for (const key of keyList) {
      const listener = ({ newValue }) => {
        if (makeReactive) {
          if (newValue !== undefined) {
            data[key] = newValue;
          } else {
            delete data[key];
          }
        } else {
          const newData = { ...data.value };
          if (newValue !== undefined) {
            newData[key] = newValue;
          } else {
            delete newData[key];
          }
          data.value = newData;
        }
      };

      storageManager.on(`change:${key}`, listener);
      listeners.push({ event: `change:${key}`, callback: listener });
    }
  };

  /**
   * Cleanup listeners
   */
  const cleanup = () => {
    for (const { event, callback } of listeners) {
      storageManager.off(event, callback);
    }
    listeners.length = 0;
  };

  // Lifecycle hooks
  onMounted(async () => {
    setupListeners();
    
    if (immediate && keys) {
      await load();
    }
  });

  onUnmounted(() => {
    cleanup();
  });

  return {
    // State
    data,
    isLoading,
    error,

    // Methods
    load,
    save,
    remove,
    update,
    getCached,

    // Utilities
    cleanup,
    storageManager // Expose manager for advanced operations
  };
}

/**
 * Specialized composable for single key storage
 */
export function useStorageItem(key, defaultValue = null, options = {}) {
  const { immediate = true, useCache = true } = options;

  const value = ref(defaultValue);
  const isLoading = ref(false);
  const error = ref(null);

  let changeListener = null;

  /**
   * Load value from storage
   */
  const load = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await storageManager.get({ [key]: defaultValue }, useCache);
      value.value = result[key];
    } catch (err) {
      error.value = err.message;
      console.error(`[useStorageItem] Load failed for key '${key}':`, err);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Save value to storage
   */
  const save = async (newValue = value.value) => {
    isLoading.value = true;
    error.value = null;

    try {
      await storageManager.set({ [key]: newValue });
      value.value = newValue;
    } catch (err) {
      error.value = err.message;
      console.error(`[useStorageItem] Save failed for key '${key}':`, err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Remove item from storage
   */
  const remove = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      await storageManager.remove(key);
      value.value = defaultValue;
    } catch (err) {
      error.value = err.message;
      console.error(`[useStorageItem] Remove failed for key '${key}':`, err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Setup change listener
   */
  const setupListener = () => {
    changeListener = ({ newValue }) => {
      value.value = newValue !== undefined ? newValue : defaultValue;
    };

    storageManager.on(`change:${key}`, changeListener);
  };

  /**
   * Cleanup listener
   */
  const cleanup = () => {
    if (changeListener) {
      storageManager.off(`change:${key}`, changeListener);
      changeListener = null;
    }
  };

  // Watch for value changes to auto-save
  const stopWatcher = watch(value, async (newValue) => {
    if (!isLoading.value) { // Avoid infinite loops during load
      try {
        await save(newValue);
      } catch (err) {
        // Error already handled in save method
      }
    }
  }, { deep: true });

  // Lifecycle
  onMounted(async () => {
    setupListener();
    
    if (immediate) {
      await load();
    }
  });

  onUnmounted(() => {
    cleanup();
    stopWatcher();
  });

  return {
    // State
    value,
    isLoading,
    error,

    // Methods
    load,
    save,
    remove,

    // Utilities
    cleanup
  };
}

/**
 * Composable for storage statistics and debugging
 */
export function useStorageDebug() {
  const stats = ref({});
  const isReady = ref(false);

  const updateStats = () => {
    stats.value = storageManager.getCacheStats();
    isReady.value = stats.value.isReady;
  };

  const clearCache = () => {
    storageManager.clearCache();
    updateStats();
  };

  const invalidateCache = (keys) => {
    storageManager.invalidateCache(keys);
    updateStats();
  };

  onMounted(() => {
    updateStats();
    
    // Update stats on storage changes
    const listener = () => updateStats();
    storageManager.on("change", listener);
    
    onUnmounted(() => {
      storageManager.off("change", listener);
    });
  });

  return {
    stats,
    isReady,
    updateStats,
    clearCache,
    invalidateCache,
    storageManager
  };
}