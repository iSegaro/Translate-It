/**
 * SettingsManager - Unified settings management system
 *
 * Provides a centralized, reactive way to access and modify settings
 * across the entire extension with immediate updates and proper caching.
 */

import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { storageManager } from '@/shared/storage/core/StorageCore.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { ref, computed, watchEffect } from 'vue'

// Lazy logger initialization to avoid TDZ issues
let logger = null;
function getLogger() {
  if (!logger) {
    try {
      logger = getScopedLogger(LOG_COMPONENTS.CONFIG, 'SettingsManager');
      // Ensure logger is not null
      if (!logger) {
        logger = {
          debug: () => {},
          warn: () => {},
          error: () => {},
          info: () => {},
          init: () => {}
        };
      }
    } catch {
      // Fallback to noop logger
      logger = {
        debug: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
        init: () => {}
      };
    }
  }
  return logger;
}

class SettingsManager {
  constructor() {
    if (SettingsManager.instance) {
      return SettingsManager.instance
    }

    SettingsManager.instance = this

    // Internal state
    this._store = null
    this._initialized = false
    this._fallbackMode = false
    this._storageListenerSetup = false
    this._eventListeners = new Map()
    this._pendingUpdates = new Map()
    this._reactiveCache = new Map()

    // Create a reactive settings object for non-Vue contexts
    this._settings = ref({})

    // Default settings from CONFIG (will be overridden by loaded settings)
    this._defaults = {
      EXTENSION_ENABLED: true,
      TRANSLATE_ON_TEXT_FIELDS: false,
      TRANSLATE_ON_TEXT_SELECTION: true,
      REQUIRE_CTRL_FOR_TEXT_SELECTION: false,
      selectionTranslationMode: 'onClick',
      ENABLE_SHORTCUT_FOR_TEXT_FIELDS: true,
      SOURCE_LANGUAGE: 'auto',
      TARGET_LANGUAGE: 'fa',
      TRANSLATION_API: 'google',
      EXCLUDED_SITES: [],
      ENHANCED_TRIPLE_CLICK_DRAG: false
    }

    // Lazy debug call to avoid TDZ
    setTimeout(() => {
      getLogger().debug('SettingsManager singleton created')
    }, 0)
  }

  /**
   * Initialize the SettingsManager
   */
  async initialize() {
    if (this._initialized) {
      getLogger().debug('SettingsManager already initialized')
      return this
    }

    try {
      // Check if Vue is available
      if (typeof window === 'undefined' || !window.Vue) {
        getLogger().debug('Vue not available, SettingsManager will use storage directly')
        this._fallbackMode = true

        // Load settings directly from storage
        try {
          const settings = await storageManager.get(Object.keys(this._defaults))
          this._settings.value = { ...this._defaults, ...settings }
          getLogger().debug('Settings loaded from storage in fallback mode')
        } catch (error) {
          getLogger().error('Failed to load settings from storage:', error)
          this._settings.value = { ...this._defaults }
        }

        // Setup storage listener for real-time updates
        this._setupStorageListener()

        this._initialized = true
        return this
      }

      // Initialize the settings store
      this._store = useSettingsStore()

      // Wait for settings to load
      if (this._store && typeof this._store.loadSettings === 'function') {
        await this._store.loadSettings()
      } else {
        getLogger().warn('Settings store not available, using storage directly')
        this._fallbackMode = true

        // Load settings directly from storage
        try {
          const settings = await storageManager.get(Object.keys(this._defaults))
          this._settings.value = { ...this._defaults, ...settings }
        } catch (error) {
          getLogger().error('Failed to load settings from storage:', error)
          this._settings.value = { ...this._defaults }
        }

        this._initialized = true
        return this
      }

      // Initialize reactive cache
      this._initializeReactiveCache()

      // Setup store watcher
      this._setupStoreWatcher()

      // Setup storage listener for fallback mode
      if (this._fallbackMode) {
        this._setupStorageListener()
      }

      this._initialized = true
      getLogger().debug('SettingsManager initialized successfully')

      return this
    } catch (error) {
      getLogger().error('Failed to initialize SettingsManager:', error)
      // Use fallback mode on error
      this._fallbackMode = true

      // Try to load from storage as fallback
      try {
        const settings = await storageManager.get(Object.keys(this._defaults))
        this._settings.value = { ...this._defaults, ...settings }
      } catch (storageError) {
        getLogger().error('Failed to load settings from storage in fallback:', storageError)
        this._settings.value = { ...this._defaults }
      }

      // Setup storage listener for real-time updates
      this._setupStorageListener()

      this._initialized = true
      return this
    }
  }

  /**
   * Get all settings as a reactive object (for Vue components)
   */
  getSettings() {
    if (!this._initialized) {
      getLogger().debug('SettingsManager not initialized, returning empty object')
      return ref({})
    }

    return this._store.settings
  }

  /**
   * Get a specific setting value (synchronous)
   */
  get(key, defaultValue = undefined) {
    if (!this._initialized) {
      getLogger().debug(`SettingsManager not initialized, returning default for ${key}`)
      return defaultValue
    }

    // In fallback mode, check loaded settings first
    if (this._fallbackMode) {
      const value = this._settings.value[key] !== undefined ? this._settings.value[key] : (this._defaults[key] !== undefined ? this._defaults[key] : defaultValue)
      if (key === 'TRANSLATE_ON_TEXT_SELECTION') {
        getLogger().debug(`TRANSLATE_ON_TEXT_SELECTION value:`, value, `(fallback mode: ${this._fallbackMode})`)
      }
      return value
    }

    // Check reactive cache first
    if (this._reactiveCache.has(key)) {
      return this._reactiveCache.get(key).value
    }

    // Fall back to store
    const value = this._store?.settings?.[key]
    return value !== undefined ? value : (this._defaults[key] !== undefined ? this._defaults[key] : defaultValue)
  }

  /**
   * Get a setting value asynchronously (ensures initialization)
   */
  async getAsync(key, defaultValue = undefined) {
    if (!this._initialized) {
      await this.initialize()
    }

    return this.get(key, defaultValue)
  }

  /**
   * Set a setting value
   */
  async set(key, value) {
    if (!this._initialized) {
      await this.initialize()
    }

    const oldValue = this.get(key)

    // In fallback mode, update storage directly
    if (this._fallbackMode) {
      try {
        await storageManager.set({ [key]: value })
        this._settings.value[key] = value

        // Emit change event
        this._emitChangeEvent(key, value, oldValue)

        getLogger().debug(`Setting updated (fallback mode): ${key} =`, value)
        return
      } catch (error) {
        getLogger().error('Failed to update setting in fallback mode:', error)
        throw error
      }
    }

    // Update through store
    await this._store.updateSettingAndPersist(key, value)

    // Emit change event
    this._emitChangeEvent(key, value, oldValue)

    getLogger().debug(`Setting updated: ${key} =`, value)
  }

  /**
   * Set multiple settings at once
   */
  async setMultiple(updates) {
    if (!this._initialized) {
      await this.initialize()
    }

    const oldValues = {}
    for (const key in updates) {
      oldValues[key] = this.get(key)
    }

    // Update through store
    await this._store.updateMultipleSettings(updates)

    // Emit change events
    for (const key in updates) {
      this._emitChangeEvent(key, updates[key], oldValues[key])
    }

    getLogger().debug('Multiple settings updated:', updates)
  }

  /**
   * Check if a setting exists
   */
  has(key) {
    if (!this._initialized) {
      return false
    }

    return key in this._store.settings
  }

  /**
   * Get all settings as a plain object
   */
  getAll() {
    if (!this._initialized) {
      return { ...this._defaults }
    }

    return { ...this._store.settings }
  }

  /**
   * Listen for settings changes
   */
  onChange(key, callback, context = null) {
    // Validate callback
    if (typeof callback !== 'function') {
      getLogger().error(`Invalid callback provided for ${key}:`, typeof callback, callback)
      return () => {} // Return noop function
    }

    const listenerId = `${key}_${Date.now()}_${Math.random()}`

    if (!this._eventListeners.has(key)) {
      this._eventListeners.set(key, new Map())
    }

    const listenerObj = { callback, context }
    Object.freeze(listenerObj) // Prevent modification
    this._eventListeners.get(key).set(listenerId, listenerObj)

    getLogger().debug(`Listener added for setting: ${key}`)

    // Return unsubscribe function
    return () => {
      const keyListeners = this._eventListeners.get(key)
      if (keyListeners) {
        keyListeners.delete(listenerId)
        if (keyListeners.size === 0) {
          this._eventListeners.delete(key)
        }
      }
    }
  }

  /**
   * Remove all listeners for a specific context
   */
  removeContextListeners(context) {
    for (const [key, listeners] of this._eventListeners) {
      for (const [id, listener] of listeners) {
        if (listener.context === context) {
          listeners.delete(id)
        }
      }
      if (listeners.size === 0) {
        this._eventListeners.delete(key)
      }
    }
  }

  /**
   * Create a computed property for a setting (Vue specific)
   */
  computed(key, defaultValue = undefined) {
    if (!this._initialized) {
      getLogger().debug('SettingsManager not initialized for computed property')
      return computed(() => defaultValue)
    }

    return computed({
      get: () => this.get(key, defaultValue),
      set: (value) => this.set(key, value)
    })
  }

  /**
   * Check if extension is enabled
   */
  isExtensionEnabled() {
    return this.get('EXTENSION_ENABLED', true)
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(featureKey) {
    // Master switch
    if (!this.isExtensionEnabled()) {
      return false
    }

    // Feature-specific flag
    return this.get(featureKey, true)
  }

  /**
   * Reset all settings to defaults
   */
  async reset() {
    if (!this._initialized) {
      await this.initialize()
    }

    await this._store.resetSettings()
    getLogger().info('All settings reset to defaults')
  }

  /**
   * Export settings
   */
  async export(password = '') {
    if (!this._initialized) {
      await this.initialize()
    }

    return await this._store.exportSettings(password)
  }

  /**
   * Import settings
   */
  async import(settingsData, password = '') {
    if (!this._initialized) {
      await this.initialize()
    }

    await this._store.importSettings(settingsData, password)
    getLogger().info('Settings imported successfully')
  }

  /**
   * Initialize reactive cache for frequently accessed settings
   */
  _initializeReactiveCache() {
    const frequentlyAccessed = [
      'EXTENSION_ENABLED',
      'TRANSLATE_ON_TEXT_FIELDS',
      'ENABLE_SHORTCUT_FOR_TEXT_FIELDS',
      'TRANSLATE_ON_TEXT_SELECTION',
      'REQUIRE_CTRL_FOR_TEXT_SELECTION',
      'TRANSLATE_WITH_SELECT_ELEMENT',
      'ACTIVE_SELECTION_ICON_ON_TEXTFIELDS',
      'ENABLE_DICTIONARY',
      'ENHANCED_TRIPLE_CLICK_DRAG'
    ]

    for (const key of frequentlyAccessed) {
      this._reactiveCache.set(key, ref(this._store.settings[key]))
    }
  }

  /**
   * Setup watcher for store changes
   */
  _setupStoreWatcher() {
    if (typeof window !== 'undefined' && window.Vue) {
      // Vue 3 watch setup
      watchEffect(() => {
        // Update reactive cache
        for (const [key, ref] of this._reactiveCache) {
          ref.value = this._store.settings[key]
        }
      })
    }
  }

  
  /**
   * Setup chrome.storage listener for fallback mode
   */
  _setupStorageListener() {
    // Only setup listener once
    if (this._storageListenerSetup) {
      getLogger().debug('Storage listener already setup, skipping')
      return
    }

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) {
      getLogger().warn('Chrome storage API not available, cannot setup storage listener')
      return
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      getLogger().debug(`Storage onChanged triggered for area: ${areaName}`, Object.keys(changes))

      if (areaName !== 'local') return

      for (const [key, change] of Object.entries(changes)) {
        if (Object.prototype.hasOwnProperty.call(this._defaults, key)) {
          // Update internal settings
          this._settings.value[key] = change.newValue

          // Emit change event
          this._emitChangeEvent(key, change.newValue, change.oldValue)

          getLogger().info(`Setting changed (storage listener): ${key} =`, change.newValue)
        }
      }
    })

    this._storageListenerSetup = true
    getLogger().debug('Storage listener setup complete')
  }

  /**
   * Manually trigger settings refresh (useful when settings are saved from options page)
   */
  async refreshSettings() {
    if (!this._initialized) {
      await this.initialize();
    }

    try {
      const currentSettings = await storageManager.get(Object.keys(this._defaults))

      for (const key in currentSettings) {
        if (Object.prototype.hasOwnProperty.call(this._defaults, key)) {
          const newValue = currentSettings[key]
          const oldValue = this._settings.value[key]

          if (newValue !== oldValue) {
            getLogger().debug(`Manual refresh detected change: ${key} =`, newValue)

            // Update internal settings
            this._settings.value[key] = newValue

            // Emit change event
            this._emitChangeEvent(key, newValue, oldValue)
          }
        }
      }

      getLogger().debug('Settings refreshed manually')
    } catch (error) {
      getLogger().error('Error manually refreshing settings:', error)
    }
  }

  /**
   * Emit change event
   */
  _emitChangeEvent(key, newValue, oldValue) {
    if (newValue === oldValue) {
      return
    }

    // Update reactive cache
    if (this._reactiveCache.has(key)) {
      this._reactiveCache.get(key).value = newValue
    }

    // Notify listeners
    const listeners = this._eventListeners.get(key)
    if (listeners) {
      getLogger().debug(`Notifying ${listeners.size} listeners for ${key}`)
      for (const listener of listeners.values()) {
        try {
          if (typeof listener.callback === 'function') {
            listener.callback(newValue, oldValue, key)
          } else {
            getLogger().error(`Invalid callback for ${key}:`, typeof listener.callback, listener)
          }
        } catch (error) {
          getLogger().error(`Error in settings listener for ${key}:`, error)
        }
      }
    }

    // Log important changes
    const importantKeys = ['EXTENSION_ENABLED', 'TRANSLATE_API', 'SOURCE_LANGUAGE', 'TARGET_LANGUAGE']
    if (importantKeys.includes(key)) {
      getLogger().info(`Important setting changed: ${key} =`, newValue)
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this._eventListeners.clear()
    this._reactiveCache.clear()
    this._initialized = false
    SettingsManager.instance = null
    getLogger().debug('SettingsManager destroyed')
  }
}

// Export singleton instance
export const settingsManager = new SettingsManager()

// Export for direct use in Vue components
export function useSettings() {
  return {
    settings: settingsManager.getSettings(),
    get: settingsManager.get.bind(settingsManager),
    getAsync: settingsManager.getAsync.bind(settingsManager),
    set: settingsManager.set.bind(settingsManager),
    setMultiple: settingsManager.setMultiple.bind(settingsManager),
    has: settingsManager.has.bind(settingsManager),
    getAll: settingsManager.getAll.bind(settingsManager),
    onChange: settingsManager.onChange.bind(settingsManager),
    computed: settingsManager.computed.bind(settingsManager),
    isExtensionEnabled: settingsManager.isExtensionEnabled.bind(settingsManager),
    isFeatureEnabled: settingsManager.isFeatureEnabled.bind(settingsManager),
    reset: settingsManager.reset.bind(settingsManager),
    export: settingsManager.export.bind(settingsManager),
    import: settingsManager.import.bind(settingsManager),
    refreshSettings: settingsManager.refreshSettings.bind(settingsManager),
    removeContextListeners: settingsManager.removeContextListeners.bind(settingsManager)
  }
}

// Initialize on module load (if in browser context)
if (typeof window !== 'undefined') {
  settingsManager.initialize().catch(error => {
    setTimeout(() => {
      getLogger().error('Failed to auto-initialize SettingsManager:', error)
    }, 0)
  })
}

export default settingsManager