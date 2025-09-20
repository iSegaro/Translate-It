/**
 * StorageCore - Centralized Storage Management System
 * Provides unified API for browser extension storage with caching and event system
 * Compatible with both Chrome and Firefox through webextension-polyfill
 *
 * This is the new unified storage system that replaces the old StorageManager
 */

// Early debug to trace module evaluation order
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import browser from "webextension-polyfill";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import SmartCache from '@/core/memory/SmartCache.js';
import { MEMORY_TIMING } from '@/core/memory/constants.js';

class StorageCore extends ResourceTracker {
  constructor() {
    super('storage-core')
    this.cache = new SmartCache({ 
      maxSize: MEMORY_TIMING.MAX_CACHE_SIZE, 
      defaultTTL: MEMORY_TIMING.CRITICAL_CACHE_TTL, 
      isCritical: true 
    }); // Critical storage cache with centralized timing
    this.listeners = new Map(); // event_name -> Set of callbacks
    this._isReady = false;
    this._readyPromise = null;
    this._changeListener = null;
    this.logger = getScopedLogger(LOG_COMPONENTS.STORAGE, 'Core');
    this.logger.init('StorageCore initialized');
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
      this.logger.init('Storage core initialized successfully');
    } catch (error) {
      this.logger.error('Initialization failed', error);
      throw error;
    }
  }

  /**
   * Setup storage change listener for cache invalidation
   */
  _setupChangeListener() {
    if (!browser?.storage?.onChanged) {
      this.logger.warn('storage.onChanged not available');
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
      // Use tracked event listener
      this.addEventListener(browser.storage.onChanged, 'change', this._changeListener);
    } catch (error) {
      this.logger.warn('Failed to setup change listener', error);
    }
  }

  /**
   * Force immediate cache invalidation for specific keys
   * This ensures that subsequent get calls will fetch fresh values
   */
  _invalidateCache(keys) {
    if (!keys || !Array.isArray(keys)) return;

    this.logger.debug(`Force invalidating cache for keys: ${keys.join(', ')}`);
    for (const key of keys) {
      this.cache.delete(key);
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
   * Normalize keys to a standard format
   * @param {string|string[]|Object} keys - Keys to normalize
   * @returns {string[]} Array of key names
   */
  _normalizeKeys(keys) {
    if (typeof keys === "string") {
      return [keys];
    } else if (Array.isArray(keys)) {
      return keys;
    } else if (typeof keys === "object" && keys !== null) {
      return Object.keys(keys);
    }
    return [];
  }

  /**
   * Get fresh values from storage, bypassing cache
   * This is useful for time-sensitive settings that need immediate consistency
   * @param {string|string[]|Object} keys - Keys to retrieve
   * @returns {Promise<Object>} Fresh values from storage
   */
  async getFresh(keys) {
    // Force cache invalidation for requested keys
    const keyList = this._normalizeKeys(keys);
    this._invalidateCache(keyList);

    // Get values (cache will be bypassed since we just invalidated)
    return this.get(keys, false);
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
      let keyList = null;
      let defaultValues = {};

      if (keys === null || keys === undefined) {
        // Get all keys
        keyList = null;
      } else {
        keyList = this._normalizeKeys(keys);
        if (typeof keys === "object" && keys !== null) {
          defaultValues = keys;
        }
      }

      // Check cache first if requested
      if (useCache && keyList) {
        // Ensure cache availability
        this._ensureCache();
        
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
      const handler = ErrorHandler.getInstance();
      handler.handle(error, { type: ErrorTypes.SERVICE, context: 'StorageCore-get' });
      throw error;
    }
  }

  /**
   * Convert Vue reactive objects (Proxy) to plain JavaScript objects
   * @param {*} obj - Object to convert
   * @returns {*} Plain JavaScript object or primitive value
   */
  _convertToPlainObject(obj) {
    // Handle null, undefined, primitives
    if (obj === null || obj === undefined || typeof obj !== "object") {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this._convertToPlainObject(item));
    }

    // Handle dates
    if (obj instanceof Date) {
      return obj;
    }

    // Handle Vue reactive objects (Proxy) or regular objects
    const plainObj = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        plainObj[key] = this._convertToPlainObject(obj[key]);
      }
    }
    return plainObj;
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
      // Convert Vue reactive objects to plain objects
      const plainData = this._convertToPlainObject(data);
      await browser.storage.local.set(plainData);

      // Update cache if requested (use plain data)
      if (updateCache) {
        // Ensure cache availability
        this._ensureCache();
        
        for (const [key, value] of Object.entries(plainData)) {
          this.cache.set(key, value);
        }
      }

      // Emit set events (use plain data)
      for (const key of Object.keys(plainData)) {
        this._emit("set", { key, value: plainData[key] });
        this._emit(`set:${key}`, { value: plainData[key] });
      }

      this.logger.debug(`Set ${Object.keys(plainData).length} key(s)`);
    } catch (error) {
      this.logger.error('Set operation failed', error);
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

      this.logger.debug(`Removed ${keyList.length} key(s)`);
    } catch (error) {
      this.logger.error('Remove operation failed', error);
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
      this.logger.debug('Storage cleared');
    } catch (error) {
      this.logger.error('Clear operation failed', error);
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
    // Ensure cache availability
    this._ensureCache();
    return this.cache.has(key) ? this.cache.get(key) : defaultValue;
  }

  /**
   * Check if key exists in cache, recreating cache if destroyed
   * @param {string} key - Key to check
   * @returns {boolean} Whether key exists in cache
   */
  hasCached(key) {
    // Ensure cache availability
    this._ensureCache();
    return this.cache.has(key);
  }

  /**
   * Ensure cache is available and recreate if destroyed
   * Enhanced cache recreation with proper re-registration
   * @private
   */
  _ensureCache() {
    if (this.cache.isDestroyed) {
      this.logger.debug('Cache was destroyed, recreating with enhanced settings...');
      
      // Create new cache with same settings
      this.cache = new SmartCache({ 
        maxSize: MEMORY_TIMING.MAX_CACHE_SIZE, 
        defaultTTL: MEMORY_TIMING.CRITICAL_CACHE_TTL, 
        isCritical: true 
      });
      
      // Re-register with memory manager for proper tracking
      this.trackCache(this.cache, { isCritical: true });
      
      this.logger.debug('Cache successfully recreated and re-registered');
    }
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

    this.logger.debug(`Invalidated cache for ${keyList.length} key(s)`);
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    this.cache.clear();
    this.logger.debug('Cache cleared');
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
          this.logger.error(`Event listener error for '${event}'`, error);
        }
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      // Remove storage change listener (handled by ResourceTracker)
      // Clear cache and listeners
      this.cache.destroy();
      this.listeners.clear();

      this._isReady = false;
      this.logger.operation('Cleanup completed');
    } catch (error) {
      this.logger.warn('Cleanup error', error);
    }
  }

  /**
   * Destroy the storage core and cleanup all resources
   */
  destroy() {
    this.cleanup();
    // Call parent destroy
    super.destroy();
  }
}

// Create singleton instance
const storageCore = new StorageCore();

// Export singleton and class with new names
export { storageCore, StorageCore };

// Backward compatibility exports
export const storageManager = storageCore;
export const StorageManager = StorageCore;

// Default export
export default storageCore;