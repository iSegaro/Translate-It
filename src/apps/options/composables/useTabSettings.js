import { computed } from 'vue'

/**
 * Composable to reduce boilerplate when managing settings in Options tabs.
 * Provides a unified way to create computed properties that sync with SettingsStore.
 * 
 * @param {Object} settingsStore - The settings store instance
 * @param {Object} logger - Scoped logger for the component
 * @returns {Object} Helper functions for settings
 */
export function useTabSettings(settingsStore, logger) {
  
  /**
   * Creates a computed property for a specific setting key.
   * 
   * @param {string} key - The setting key in the store (e.g., 'SHOW_DESKTOP_FAB')
   * @param {any} defaultValue - Value to use if the setting is undefined
   * @param {Object} options - Configuration options
   * @param {Function} options.transformGet - Function to transform the value when reading
   * @param {Function} options.transformSet - Function to transform the value when writing
   * @param {Function} options.onChanged - Callback function to run after the setting is updated
   * @returns {import('vue').ComputedRef} A Vue computed property
   */
  const createSetting = (key, defaultValue = null, options = {}) => {
    return computed({
      get: () => {
        const value = settingsStore.settings?.[key]
        const finalValue = value !== undefined ? value : defaultValue
        
        if (options.transformGet) {
          return options.transformGet(finalValue)
        }
        return finalValue
      },
      set: (value) => {
        let newValue = value
        if (options.transformSet) {
          newValue = options.transformSet(value)
        }
        
        // Log the change for debugging
        logger.debug(`📝 Setting [${key}] changed:`, newValue)
        
        // Update the store
        settingsStore.updateSettingLocally(key, newValue)
        
        // Run callback if provided
        if (options.onChanged) {
          options.onChanged(newValue)
        }
      }
    })
  }

  /**
   * Creates multiple settings at once (convenience helper)
   * @param {Object} definitions - Key-value pairs of { propertyName: keyInStore } or { propertyName: [keyInStore, defaultValue] }
   */
  const createSettings = (definitions) => {
    const result = {}
    for (const [propName, config] of Object.entries(definitions)) {
      if (Array.isArray(config)) {
        result[propName] = createSetting(config[0], config[1])
      } else {
        result[propName] = createSetting(config)
      }
    }
    return result
  }

  /**
   * Creates a computed property for a mode-specific provider setting.
   * Handles the 'default' value mapping to null in the store.
   * 
   * @param {string} mode - The translation mode (from TranslationMode enum)
   * @returns {import('vue').ComputedRef} A Vue computed property
   */
  const createProviderSetting = (mode) => computed({
    get: () => settingsStore.settings?.MODE_PROVIDERS?.[mode] || 'default',
    set: (value) => {
      const modeProviders = { 
        ...(settingsStore.settings?.MODE_PROVIDERS || {}), 
        [mode]: value === 'default' ? null : value 
      }
      logger.debug(`📝 Provider for mode [${mode}] changed:`, value)
      settingsStore.updateSettingLocally('MODE_PROVIDERS', modeProviders)
    }
  })

  return {
    createSetting,
    createSettings,
    createProviderSetting
  }
}
