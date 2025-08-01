/**
 * StorageManager - Centralized Storage Management System
 * Provides unified API for browser extension storage with caching and event system
 * Compatible with both Chrome and Firefox through webextension-polyfill
 */

import browser from "webextension-polyfill";

class StorageManager {
  constructor() {
    this.cache = new Map();
    this.listeners = new Map(); // event_name -> Set of callbacks
    this._isReady = false;
    this._readyPromise = null;
    this._changeListener = null;
    this._initializeAsync();
  }

  /**
   * Initialize storage manager asynchronously
   */
  async _initializeAsync() {
    if (this._readyPromise) {
      return this._readyPromise;
    }

    this._readyPromise = this._initialize();
    return this._readyPromise;
  }

  async _initialize() {
    try {
      // Test browser storage availability
      if (!browser?.storage?.local) {
        throw new Error("Browser storage API not available");
      }

      // Test storage access
      await browser.storage.local.get(["__storage_test__"]);

      // Setup change listener for cache invalidation
      this._setupChangeListener();

      this._isReady = true;
      console.log("✅ [StorageManager] Initialized successfully");
    } catch (error) {
      console.error("❌ [StorageManager] Initialization failed:", error);
      throw error;
    }
  }

  /**
   * Setup storage change listener for cache invalidation
   */
  _setupChangeListener() {
    if (!browser?.storage?.onChanged) {
      console.warn("[StorageManager] storage.onChanged not available");
      return;
    }

    this._changeListener = (changes, areaName) => {
      if (areaName !== "local") return;

      // Update cache and emit events
      for (const [key, { newValue, oldValue }] of Object.entries(changes)) {
        // Update cache
        if (newValue !== undefined) {
          this.cache.set(key, newValue);
        } else {
          this.cache.delete(key);
        }

        // Emit change events
        this._emit("change", { key, newValue, oldValue });
        this._emit(`change:${key}`, { newValue, oldValue });
      }
    };

    try {
      browser.storage.onChanged.addListener.call(
        browser.storage.onChanged,
        this._changeListener
      );
    } catch (error) {
      console.warn("[StorageManager] Failed to setup change listener:", error);
    }
  }

  /**
   * Ensure storage manager is ready
   */
  async _ensureReady() {
    if (this._isReady) return;
    await this._readyPromise;
  }

  /**
   * Get values from storage
   * @param {string|string[]|Object} keys - Keys to retrieve
   * @param {boolean} useCache - Whether to use cache (default: true)
   * @returns {Promise<Object>} Retrieved values
   */
  async get(keys, useCache = true) {
    await this._ensureReady();

    try {
      // Handle different key formats
      let keyList = [];
      let defaultValues = {};

      if (typeof keys === "string") {
        keyList = [keys];
      } else if (Array.isArray(keys)) {
        keyList = keys;
      } else if (typeof keys === "object" && keys !== null) {
        keyList = Object.keys(keys);
        defaultValues = keys;
      } else {
        // Get all keys
        keyList = null;
      }

      // Check cache first if requested
      if (useCache && keyList) {
        const cachedResult = {};
        const uncachedKeys = [];

        for (const key of keyList) {
          if (this.cache.has(key)) {
            cachedResult[key] = this.cache.get(key);
          } else {
            uncachedKeys.push(key);
          }
        }

        // If all keys are cached, return cached result
        if (uncachedKeys.length === 0) {
          return { ...defaultValues, ...cachedResult };
        }

        // Fetch uncached keys from storage
        if (uncachedKeys.length > 0) {
          const storageResult = await browser.storage.local.get(uncachedKeys);
          
          // Update cache with new values
          for (const [key, value] of Object.entries(storageResult)) {
            this.cache.set(key, value);
          }

          return { ...defaultValues, ...cachedResult, ...storageResult };
        }
      }

      // Fetch from storage
      const result = await browser.storage.local.get(keyList || undefined);

      // Update cache
      for (const [key, value] of Object.entries(result)) {
        this.cache.set(key, value);
      }

      // Apply default values if provided
      return { ...defaultValues, ...result };

    } catch (error) {
      console.error("[StorageManager] Get operation failed:", error);
      throw error;
    }
  }

  /**
   * Set values in storage
   * @param {Object} data - Key-value pairs to store
   * @param {boolean} updateCache - Whether to update cache (default: true)
   * @returns {Promise<void>}
   */
  async set(data, updateCache = true) {
    await this._ensureReady();

    if (!data || typeof data !== "object") {
      throw new Error("Data must be an object");
    }

    try {
      await browser.storage.local.set(data);

      // Update cache if requested
      if (updateCache) {
        for (const [key, value] of Object.entries(data)) {
          this.cache.set(key, value);
        }
      }

      // Emit set events
      for (const key of Object.keys(data)) {
        this._emit("set", { key, value: data[key] });
        this._emit(`set:${key}`, { value: data[key] });
      }

      console.log(`[StorageManager] Set ${Object.keys(data).length} key(s)`);
    } catch (error) {
      console.error("[StorageManager] Set operation failed:", error);
      throw error;
    }
  }

  /**
   * Remove keys from storage
   * @param {string|string[]} keys - Keys to remove
   * @param {boolean} updateCache - Whether to update cache (default: true)
   * @returns {Promise<void>}
   */
  async remove(keys, updateCache = true) {
    await this._ensureReady();

    const keyList = Array.isArray(keys) ? keys : [keys];

    try {
      await browser.storage.local.remove(keyList);

      // Update cache if requested
      if (updateCache) {
        for (const key of keyList) {
          this.cache.delete(key);
        }
      }

      // Emit remove events
      for (const key of keyList) {
        this._emit("remove", { key });
        this._emit(`remove:${key}`, {});
      }

      console.log(`[StorageManager] Removed ${keyList.length} key(s)`);
    } catch (error) {
      console.error("[StorageManager] Remove operation failed:", error);
      throw error;
    }
  }

  /**
   * Clear all storage
   * @param {boolean} updateCache - Whether to clear cache (default: true)
   * @returns {Promise<void>}
   */
  async clear(updateCache = true) {
    await this._ensureReady();

    try {
      await browser.storage.local.clear();

      if (updateCache) {
        this.cache.clear();
      }

      this._emit("clear", {});
      console.log("[StorageManager] Storage cleared");
    } catch (error) {
      console.error("[StorageManager] Clear operation failed:", error);
      throw error;
    }
  }

  /**
   * Get cached value (synchronous)
   * @param {string} key - Key to retrieve
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Cached value or default
   */
  getCached(key, defaultValue = undefined) {
    return this.cache.has(key) ? this.cache.get(key) : defaultValue;
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Key to check
   * @returns {boolean} Whether key exists in cache
   */
  hasCached(key) {
    return this.cache.has(key);
  }

  /**
   * Invalidate cache for specific keys
   * @param {string|string[]} keys - Keys to invalidate
   */
  invalidateCache(keys) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    
    for (const key of keyList) {
      this.cache.delete(key);
    }

    console.log(`[StorageManager] Invalidated cache for ${keyList.length} key(s)`);
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    this.cache.clear();
    console.log("[StorageManager] Cache cleared");
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      isReady: this._isReady
    };
  }

  /**
   * Add event listener
   * @param {string} event - Event name (change, set, remove, clear)
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
      
      // Clean up empty listener sets
      if (this.listeners.get(event).size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit event to listeners
   * @private
   */
  _emit(event, data) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      for (const callback of callbacks) {
        try {
          callback(data);
        } catch (error) {
          console.error(`[StorageManager] Event listener error for '${event}':`, error);
        }
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      // Remove storage change listener
      if (this._changeListener && browser?.storage?.onChanged) {
        browser.storage.onChanged.removeListener(this._changeListener);
      }

      // Clear cache and listeners
      this.cache.clear();
      this.listeners.clear();

      this._isReady = false;
      console.log("[StorageManager] Cleanup completed");
    } catch (error) {
      console.warn("[StorageManager] Cleanup error:", error);
    }
  }
}

// Create singleton instance
const storageManager = new StorageManager();

// Export singleton and class
export { storageManager, StorageManager };
export default storageManager;