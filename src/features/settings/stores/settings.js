import { defineStore } from 'pinia'
import { ref, computed, onUnmounted, getCurrentInstance } from 'vue'
import browser from 'webextension-polyfill'
import { CONFIG, TranslationMode, SelectionTranslationMode } from '@/shared/config/config.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js'
import secureStorage from '@/shared/storage/core/SecureStorage.js'
import { storageManager } from '@/shared/storage/core/StorageCore.js'
import ExtensionContextManager from '@/core/extensionContext.js'
import { runSettingsMigrations } from '@/shared/config/settingsMigrations.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { TTS_ENGINES } from '@/shared/constants/tts.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.SETTINGS, 'settings');

// --- Helpers ------------------------------------------------------------
function getDefaultSettings() {
  return {
    THEME: CONFIG.THEME || 'auto',
    APPLICATION_LOCALIZE: CONFIG.APPLICATION_LOCALIZE || 'en',
    EXTENSION_ENABLED: CONFIG.EXTENSION_ENABLED ?? true,
    ENABLE_TRANSLATION_HISTORY: CONFIG.ENABLE_TRANSLATION_HISTORY ?? true,
    TRANSLATION_API: CONFIG.TRANSLATION_API || ProviderRegistryIds.GOOGLE_V2,
    MODE_PROVIDERS: CONFIG.MODE_PROVIDERS || {
      [TranslationMode.Field]: null,
      [TranslationMode.Select_Element]: null,
      [TranslationMode.Selection]: null,
      [TranslationMode.Page]: null,
      [TranslationMode.Dictionary_Translation]: null,
      [TranslationMode.Popup_Translate]: null,
      [TranslationMode.Sidepanel_Translate]: null,
      [TranslationMode.ScreenCapture]: null
    },
    SOURCE_LANGUAGE: CONFIG.SOURCE_LANGUAGE || 'auto',
    TARGET_LANGUAGE: CONFIG.TARGET_LANGUAGE || 'en',
    LANGUAGE_DETECTION_PREFERENCES: CONFIG.LANGUAGE_DETECTION_PREFERENCES || {
      "arabic-script": "fa", // پیش‌فرض: وقتی اسکریپت عربی تشخیص داده شد، اولویت با فارسی باشد
      "chinese-script": "zh-cn", // چینی ساده‌شده
      "devanagari-script": "hi", // هندی
      "latin-script": "none" // هیچکدام (اجازه به تشخیص خودکار پرووایدر)
    },
    TIMEOUT: CONFIG.TIMEOUT || 30000,
    selectionTranslationMode: CONFIG.selectionTranslationMode || SelectionTranslationMode.ON_CLICK,
    COPY_REPLACE: CONFIG.COPY_REPLACE || 'replace',
    REPLACE_SPECIAL_SITES: CONFIG.REPLACE_SPECIAL_SITES ?? true,
    PROMPT_TEMPLATE: CONFIG.PROMPT_TEMPLATE || 'Please translate the following text from $_{SOURCE} to $_{TARGET}:\n\n$_{TEXT}',
    PROMPT_TEMPLATE_AUTO: CONFIG.PROMPT_TEMPLATE_AUTO || '',
    PROMPT_BASE_FIELD_AUTO: CONFIG.PROMPT_BASE_FIELD_AUTO || '',
    PROMPT_BASE_AI_BATCH_AUTO: CONFIG.PROMPT_BASE_AI_BATCH_AUTO || '',
    PROMPT_BASE_AI_FOLLOWUP_AUTO: CONFIG.PROMPT_BASE_AI_FOLLOWUP_AUTO || '',
    API_KEY: CONFIG.API_KEY || '',
    OPENAI_API_KEY: CONFIG.OPENAI_API_KEY || '',
    OPENAI_API_URL: CONFIG.OPENAI_API_URL || '',
    OPENAI_API_MODEL: CONFIG.OPENAI_API_MODEL || 'gpt-4o',
    OPENAI_MODELS: CONFIG.OPENAI_MODELS || [],
    OPENROUTER_API_KEY: CONFIG.OPENROUTER_API_KEY || '',
    OPENROUTER_API_URL: CONFIG.OPENROUTER_API_URL || '',
    OPENROUTER_API_MODEL: CONFIG.OPENROUTER_API_MODEL || 'openai/gpt-4o',
    OPENROUTER_MODELS: CONFIG.OPENROUTER_MODELS || [],
    DEEPSEEK_API_KEY: CONFIG.DEEPSEEK_API_KEY || '',
    DEEPSEEK_API_URL: CONFIG.DEEPSEEK_API_URL || '',
    DEEPSEEK_API_MODEL: CONFIG.DEEPSEEK_API_MODEL || 'deepseek-chat',
    DEEPSEEK_MODELS: CONFIG.DEEPSEEK_MODELS || [],
    GEMINI_API_KEY: CONFIG.GEMINI_API_KEY || '',
    GEMINI_API_URL: CONFIG.GEMINI_API_URL || '',
    GEMINI_MODEL: CONFIG.GEMINI_MODEL || 'gemini-2.5-flash',
    GEMINI_MODELS: CONFIG.GEMINI_MODELS || [],
    GEMINI_THINKING_ENABLED: CONFIG.GEMINI_THINKING_ENABLED ?? false,
    LINGVA_API_URL: CONFIG.LINGVA_API_URL || '',
    CUSTOM_API_URL: CONFIG.CUSTOM_API_URL || '',
    CUSTOM_API_KEY: CONFIG.CUSTOM_API_KEY || '',
    CUSTOM_API_MODEL: CONFIG.CUSTOM_API_MODEL || '',
    WEBAI_API_URL: CONFIG.WEBAI_API_URL || '',
    WEBAI_API_MODEL: CONFIG.WEBAI_API_MODEL || '',
    // DeepL Settings
    DEEPL_API_KEY: CONFIG.DEEPL_API_KEY || '',
    DEEPL_API_TIER: CONFIG.DEEPL_API_TIER || 'free',
    DEEPL_FORMALITY: CONFIG.DEEPL_FORMALITY || 'default',
    DEEPL_BETA_LANGUAGES_ENABLED: CONFIG.DEEPL_BETA_LANGUAGES_ENABLED ?? true,
    // browser Translation API Settings
    BROWSER_TRANSLATE_ENABLED: CONFIG.BROWSER_TRANSLATE_ENABLED ?? true,
    BROWSER_TRANSLATE_AUTO_DOWNLOAD: CONFIG.BROWSER_TRANSLATE_AUTO_DOWNLOAD ?? true,
    TTS_ENGINE: CONFIG.TTS_ENGINE || TTS_ENGINES.EDGE,
    TTS_FALLBACK_ENABLED: CONFIG.TTS_FALLBACK_ENABLED ?? true,
    TTS_AUTO_DETECT_ENABLED: CONFIG.TTS_AUTO_DETECT_ENABLED ?? true,
    SHOW_DESKTOP_FAB: CONFIG.SHOW_DESKTOP_FAB ?? true,
    SHOW_MOBILE_FAB: CONFIG.SHOW_MOBILE_FAB ?? true,
    TRANSLATE_ON_TEXT_FIELDS: CONFIG.TRANSLATE_ON_TEXT_FIELDS ?? false,
    ENABLE_SHORTCUT_FOR_TEXT_FIELDS: CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS ?? true,
    TEXT_FIELD_SHORTCUT: CONFIG.TEXT_FIELD_SHORTCUT || 'Ctrl+/',
    TRANSLATE_WITH_SELECT_ELEMENT: CONFIG.TRANSLATE_WITH_SELECT_ELEMENT ?? true,
    SELECT_ELEMENT_SHOW_ORIGINAL_ON_HOVER: CONFIG.SELECT_ELEMENT_SHOW_ORIGINAL_ON_HOVER ?? false, // نمایش متن اصلی هنگام hover در حالت انتخاب المان
    TRANSLATE_ON_TEXT_SELECTION: CONFIG.TRANSLATE_ON_TEXT_SELECTION,
    REQUIRE_CTRL_FOR_TEXT_SELECTION: CONFIG.REQUIRE_CTRL_FOR_TEXT_SELECTION ?? false,
    ENABLE_DICTIONARY: CONFIG.ENABLE_DICTIONARY ?? true,
    ENABLE_SCREEN_CAPTURE: CONFIG.ENABLE_SCREEN_CAPTURE ?? true,
    ACTIVE_SELECTION_ICON_ON_TEXTFIELDS: CONFIG.ACTIVE_SELECTION_ICON_ON_TEXTFIELDS ?? true,
    ENHANCED_TRIPLE_CLICK_DRAG: CONFIG.ENHANCED_TRIPLE_CLICK_DRAG ?? false,
    MOBILE_UI_MODE: CONFIG.MOBILE_UI_MODE || MOBILE_CONSTANTS.UI_MODE.AUTO,
    MOBILE_PAGE_TRANSLATION_AUTO_CLOSE: CONFIG.MOBILE_PAGE_TRANSLATION_AUTO_CLOSE ?? false,
    DEBUG_MODE: CONFIG.DEBUG_MODE ?? false,
    COMPONENT_LOG_LEVELS: CONFIG.COMPONENT_LOG_LEVELS || {},
    EXCLUDED_SITES: CONFIG.EXCLUDED_SITES || [],
    // Proxy Settings
    PROXY_ENABLED: CONFIG.PROXY_ENABLED ?? false,
    PROXY_TYPE: CONFIG.PROXY_TYPE || 'http',
    PROXY_HOST: CONFIG.PROXY_HOST || '',
    PROXY_PORT: CONFIG.PROXY_PORT || 8080,
    PROXY_USERNAME: CONFIG.PROXY_USERNAME || '',
    PROXY_PASSWORD: CONFIG.PROXY_PASSWORD || '',
    // Font Settings
    TRANSLATION_FONT_FAMILY: CONFIG.TRANSLATION_FONT_FAMILY || 'auto',
    TRANSLATION_FONT_SIZE: CONFIG.TRANSLATION_FONT_SIZE || '14',
    // Whole Page Translation Settings
    WHOLE_PAGE_TRANSLATION_ENABLED: CONFIG.WHOLE_PAGE_TRANSLATION_ENABLED ?? true,
    WHOLE_PAGE_LAZY_LOADING: CONFIG.WHOLE_PAGE_LAZY_LOADING ?? true,
    WHOLE_PAGE_AUTO_TRANSLATE_ON_DOM_CHANGES: CONFIG.WHOLE_PAGE_AUTO_TRANSLATE_ON_DOM_CHANGES ?? true,
    WHOLE_PAGE_EXCLUDED_SELECTORS: CONFIG.WHOLE_PAGE_EXCLUDED_SELECTORS || ["script", "style", "code", "pre", "noscript", "meta", "textarea", "link", "time", "kbd", "svg", "ruby", "rt", "rp", "math", "d-math", "samp", ".notranslate", "[contenteditable='true']", "[translate=no]", ".social-share", ".share-nav", "[data-toolbar=share]", ".o-share", ".prism-code", ".enlighter-code", ".rc-CodeBlock", "[role=code]", "table.highlight", "hypothesis-highlight", ".hypothesis-highlight", ".material-icons", "material-icon", "span[class^=material-symbols-]", ".google-symbols", "i.fa", "i[class^=fa-]", "visuallyhidden", "[data-translate-ignore]"],
    WHOLE_PAGE_ATTRIBUTES_TO_TRANSLATE: CONFIG.WHOLE_PAGE_ATTRIBUTES_TO_TRANSLATE || ["title", "alt", "placeholder", "label", "value"],
    WHOLE_PAGE_MAX_ELEMENTS: CONFIG.WHOLE_PAGE_MAX_ELEMENTS || 10000,
    WHOLE_PAGE_CHUNK_SIZE: CONFIG.WHOLE_PAGE_CHUNK_SIZE || 250,
    WHOLE_PAGE_MAX_CHARS: CONFIG.WHOLE_PAGE_MAX_CHARS || 5000,
    WHOLE_PAGE_AI_MAX_CHARS: CONFIG.WHOLE_PAGE_AI_MAX_CHARS || 15000,
    WHOLE_PAGE_DEBOUNCE_DELAY: CONFIG.WHOLE_PAGE_DEBOUNCE_DELAY || 500,
    WHOLE_PAGE_ROOT_MARGIN: CONFIG.WHOLE_PAGE_ROOT_MARGIN || '10px',
    WHOLE_PAGE_PROGRESS_UPDATE_INTERVAL: CONFIG.WHOLE_PAGE_PROGRESS_UPDATE_INTERVAL || 100,
    WHOLE_PAGE_SHOW_ORIGINAL_ON_HOVER: CONFIG.WHOLE_PAGE_SHOW_ORIGINAL_ON_HOVER ?? false,
    WHOLE_PAGE_TRANSLATE_AFTER_SCROLL_STOP: CONFIG.WHOLE_PAGE_TRANSLATE_AFTER_SCROLL_STOP ?? false,
    WHOLE_PAGE_SCROLL_STOP_DELAY: CONFIG.WHOLE_PAGE_SCROLL_STOP_DELAY || 500,
    // AI Optimization Settings
    AI_CONTEXT_TRANSLATION_ENABLED: CONFIG.AI_CONTEXT_TRANSLATION_ENABLED ?? true,
    AI_CONVERSATION_HISTORY_ENABLED: CONFIG.AI_CONVERSATION_HISTORY_ENABLED ?? false,
    OPTIMIZATION_LEVEL: CONFIG.OPTIMIZATION_LEVEL || 3,
    PROVIDER_OPTIMIZATION_LEVELS: CONFIG.PROVIDER_OPTIMIZATION_LEVELS || {},
    BILINGUAL_TRANSLATION: CONFIG.BILINGUAL_TRANSLATION ?? true,
    BILINGUAL_TRANSLATION_MODES: CONFIG.BILINGUAL_TRANSLATION_MODES || {
      [TranslationMode.Popup_Translate]: true,
      [TranslationMode.Sidepanel_Translate]: true,
      [TranslationMode.Select_Element]: true,
      [TranslationMode.Field]: true,
      [TranslationMode.Selection]: true,
      [TranslationMode.Page]: false,
      [TranslationMode.Dictionary_Translation]: true,
      [TranslationMode.ScreenCapture]: true
    },
    CONTEXT_MENU_VISIBILITY: CONFIG.CONTEXT_MENU_VISIBILITY || {
      PAGE_CONTEXT_SELECT_ELEMENT: true,
      ACTION_CONTEXT_SELECT_ELEMENT: true,
      ACTION_CONTEXT_OPTIONS: true,
      ACTION_CONTEXT_SHORTCUTS: true,
      ACTION_CONTEXT_HELP: true
    },
    translationHistory: []
  };
}

export const useSettingsStore = defineStore('settings', () => {
  // State - complete settings object with CONFIG defaults
  const settings = ref(getDefaultSettings())
  
  // Loading states
  const isLoading = ref(false)
  const isInitialized = ref(false)
  const isSaving = ref(false)
  const isSettingsValid = ref(true) // Global validation state for options UI
  
  // Getters
  const isDarkTheme = computed(() => {
    if (settings.value.THEME === 'auto') {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return settings.value.THEME === 'dark'
  })
  
  const canTranslate = computed(() => {
    return settings.value.EXTENSION_ENABLED && settings.value.TRANSLATION_API && !isLoading.value
  })
  
  const sourceLanguage = computed(() => settings.value.SOURCE_LANGUAGE)
  const targetLanguage = computed(() => settings.value.TARGET_LANGUAGE)
  const selectedProvider = computed(() => settings.value.TRANSLATION_API)
  
  // Font settings getters
  const fontFamily = computed(() => settings.value.TRANSLATION_FONT_FAMILY)
  const fontSize = computed(() => settings.value.TRANSLATION_FONT_SIZE)
  
  // Actions
  let __loadInFlight = null;
  const loadSettings = async () => {
    if (isInitialized.value) return settings.value;
    if (__loadInFlight) return __loadInFlight;
    isLoading.value = true;
    __loadInFlight = (async () => {
      try {
        const stored = await storageManager.get(null);
        const current = settings.value;

  
        // Merge settings from storage (after potential migrations)
        Object.keys(current).forEach(key => {
          if (Object.prototype.hasOwnProperty.call(stored, key) && stored[key] !== undefined) {
            if (key === 'EXCLUDED_SITES') {
              if (Array.isArray(stored[key])) current[key] = stored[key];
              else if (typeof stored[key] === 'object' && stored[key] !== null) current[key] = Object.values(stored[key]).filter(s => typeof s === 'string');
              else current[key] = [];
            } else if (key === 'translationHistory') {
              current[key] = Array.isArray(stored[key]) ? stored[key] : [];
            } else {
              current[key] = stored[key];
            }
          }
        });

        logger.debug('Settings merged from storage');

        isInitialized.value = true;
        
        // Setup listener for future changes
        await setupStorageListener();
        
        return current;
      } catch (error) {
        if (ExtensionContextManager.isContextError(error)) {
          ExtensionContextManager.handleContextError(error, 'settings-store-load');
        } else {
          logger.error('Failed to load settings:', error);
        }
        throw error;
      } finally {
        isLoading.value = false;
        __loadInFlight = null;
      }
    })();
    return __loadInFlight;
  }
  
  // Debounced save (simple trailing debounce)
  let __saveTimer = null;
  const saveAllSettings = async (immediate = false) => {
    if (immediate) {
      clearTimeout(__saveTimer);
      return performSave();
    }
    return new Promise((resolve, reject) => {
      clearTimeout(__saveTimer);
      __saveTimer = setTimeout(() => performSave().then(resolve).catch(reject), 120);
    });
  }

  /**
   * Sanitizes settings before saving to prevent logical inconsistencies.
   * - If Desktop FAB is disabled, ensure selectionTranslationMode is not set to ON_FAB_CLICK.
   */
  const sanitizeSettings = () => {
    const s = settings.value;
    
    // 1. FAB Consistency: If BOTH FABs are disabled, we can't use it for translation trigger.
    // Fallback to ON_CLICK (Show icon) to ensure user has a way to translate.
    if (s.SHOW_DESKTOP_FAB === false && s.SHOW_MOBILE_FAB === false && s.selectionTranslationMode === SelectionTranslationMode.ON_FAB_CLICK) {
      logger.info('Sanitizing settings: Both FABs disabled, falling back selectionTranslationMode to ON_CLICK');
      s.selectionTranslationMode = SelectionTranslationMode.ON_CLICK;
    }
    
    // 2. Extension State: If extension is disabled, ensure we still allow some internal state to be consistent
    // (Add more sanitization rules here if needed in the future)
  }

  async function performSave() {
    isSaving.value = true;
    try {
      // Run sanitization before saving
      sanitizeSettings();
      
      await storageManager.set(settings.value);
      return true;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'settings-store-save');
      } else {
        logger.error('Failed to save all settings:', error);
      }
      throw error;
    } finally {
      isSaving.value = false;
    }
  }
  
  // Action to update a single setting in the local store state (without immediate persistence)
  const updateSettingLocally = (key, value) => {
    settings.value[key] = value
  }

  // Action to update a single setting and immediately persist it to storage
  const updateSettingAndPersist = async (key, value) => {
    try {
      settings.value[key] = value // Update local state
      
      const updates = { [key]: value };

      // SMART CLEANUP: If Debug Mode is disabled while Mock provider is active, 
      // automatically switch to the system default provider.
      if (key === 'DEBUG_MODE' && value === false) {
        const currentApi = settings.value['TRANSLATION_API'];
        if (currentApi === 'mock') {
          const defaultApi = CONFIG.TRANSLATION_API || 'googlev2';
          
          settings.value['TRANSLATION_API'] = defaultApi;
          updates['TRANSLATION_API'] = defaultApi;
          
          logger.info(`Debug mode disabled while Mock was active. Reverting provider to default: ${defaultApi}`);
        }
      }

      await storageManager.set(updates) // Persist all changes
      return true
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, `settings-store-update-${key}`);
      } else {
        logger.error(`Failed to update and persist setting ${key}:`, error);
      }
      throw error
    }
  }
  
  const updateMultipleSettings = async (updates) => {
    try {
      // Update local state
      Object.assign(settings.value, updates)
      
      // Get browser API and save to storage
  await storageManager.set(settings.value)
      
      return true
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'settings-store-update-multiple');
      } else {
        logger.error('Failed to update multiple settings:', error);
      }
      throw error
    }
  }
  
  const resetSettings = async () => {
    try {
      await storageManager.clear();
      const defaults = getDefaultSettings();
      // Preserve reference to reactive object
      Object.keys(settings.value).forEach(k => delete settings.value[k]);
      Object.assign(settings.value, defaults);
      await saveAllSettings(true);
      return true;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'settings-store-reset');
      } else {
        logger.error('Failed to reset settings:', error);
      }
      throw error;
    }
  }
  
  const exportSettings = async (password = '') => {
    try {
      const settingsToExport = await loadSettings();
      
      // Use the centralized secureStorage utility for consistent export behavior
      // This will handle API key encryption and exclude large data like history
      const exportData = await secureStorage.prepareForExport(
        settingsToExport,
        password
      );

      // Add additional metadata for the export
      let version;
      try { 
        version = browser.runtime.getManifest()?.version; 
      } catch {
        // Browser runtime not available, use undefined
      }

      return {
        ...exportData,
        _exported: true,
        _timestamp: new Date().toISOString(),
        _version: version
      };
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'settings-store-export');
      } else {
        logger.error('Failed to export settings:', error);
      }
      throw error;
    }
  }
  
  const importSettings = async (importData, password = '') => {
    try {
      logger.info('[Import] Starting');
      const processedSettings = await secureStorage.processImportedSettings(importData, password);

      // 1. Merge imported settings with default settings to ensure no missing keys
      const defaultSettings = getDefaultSettings();
      const mergedSettings = { ...defaultSettings, ...processedSettings };
      
      // Special handling for nested MODE_PROVIDERS to ensure deep merge
      if (processedSettings.MODE_PROVIDERS) {
        mergedSettings.MODE_PROVIDERS = {
          ...defaultSettings.MODE_PROVIDERS,
          ...processedSettings.MODE_PROVIDERS
        };
      }

      // 2. Run the centralized migration logic on the imported data
      // This handles MODE_PROVIDERS (underscore to hyphen), API_KEY, etc.
      const { updates, logs } = await runSettingsMigrations(mergedSettings);

      // 3. Apply all migrated updates to our final settings object
      Object.assign(mergedSettings, updates);
      
      if (logs && logs.length > 0) {
        logger.info('[Import] Migrations applied:', logs);
      }

      // Temporarily remove storage listener to prevent interference during import
      if (storageListener) {
        storageManager.off('change', storageListener);
        storageListener = null;
      }

      // 4. Update local state with the fully migrated and merged settings
      // We replace the entire settings object to ensure no stale old keys remain
      Object.keys(settings.value).forEach(k => delete settings.value[k]);
      Object.assign(settings.value, mergedSettings);

      await saveAllSettings();

      // Re-setup storage listener after import is complete
      await setupStorageListener();

      logger.info('[Import] Completed');

      // Reload page to apply new settings
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      return true;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'settings-store-import');
      } else {
        logger.error('[Import] Failed:', error);
      }
      // Re-setup storage listener on error
      await setupStorageListener();
      throw error;
    }
  }
  
  const getSetting = (key, defaultValue = null) => {
    return settings.value[key] !== undefined ? settings.value[key] : defaultValue
  }
  
  const validateSettings = () => {
    const errors = []
    
    // Validate languages
    if (!settings.value.SOURCE_LANGUAGE) {
      errors.push('Source language is required')
    }
    
    if (!settings.value.TARGET_LANGUAGE) {
      errors.push('Target language is required')
    }
    
    if (settings.value.SOURCE_LANGUAGE === settings.value.TARGET_LANGUAGE) {
      errors.push('Source and target languages cannot be the same')
    }
    
    // Validate API keys for selected provider
  const provider = settings.value.TRANSLATION_API
    if (['gemini', 'openai', 'openrouter', 'deepseek', 'custom'].includes(provider)) {
      const keyField = provider === 'custom' ? 'CUSTOM_API_KEY' : 'API_KEY'
      if (!settings.value[keyField]) {
        errors.push(`API key is required for ${provider}`)
      }
    }
    
    // Validate prompt templates
    if (!settings.value.PROMPT_TEMPLATE || !settings.value.PROMPT_TEMPLATE.includes('$_{TEXT}')) {
      errors.push('Prompt template must include $_{TEXT} placeholder')
    }
    
    if (settings.value.PROMPT_TEMPLATE_AUTO && !settings.value.PROMPT_TEMPLATE_AUTO.includes('$_{TEXT}')) {
      errors.push('Auto prompt template must include $_{TEXT} placeholder if provided')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
  
  /**
   * Resets the store to its default state.
   * Required for setup-style Pinia stores to support $reset().
   */
  function $reset() {
    settings.value = getDefaultSettings()
    isInitialized.value = false
    isLoading.value = false
    isSaving.value = false
  }
    
  // Storage change listener
  let storageListener = null

  // Handle storage changes from other parts of extension
  const handleStorageChange = ({ key, newValue, oldValue }) => {
    // Update the reactive settings ref
    if (settings.value[key] !== newValue) {
      settings.value[key] = newValue

      // Special handling for DEBUG_MODE - sync with logging system
      if (key === 'DEBUG_MODE' && oldValue !== newValue) {
        handleDebugModeChange(Boolean(newValue))
      }

      // Special handling for COMPONENT_LOG_LEVELS - sync with logging system
      if (key === 'COMPONENT_LOG_LEVELS' && JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        handleComponentLogLevelsChange(newValue)
      }
    }
  }

  // Handle DEBUG_MODE changes and sync with logging system
  const handleDebugModeChange = async (debugMode) => {
    try {
      // Import and initialize DebugModeBridge
      const { debugModeBridge } = await import('@/shared/logging/DebugModeBridge.js')

      // Apply debug mode to logging system
      debugModeBridge.handleDebugModeChange(debugMode)

      logger.info('[SettingsStore] DEBUG_MODE changed and synced with logging system', {
        debugMode,
        source: 'storage_change'
      })
    } catch (error) {
      logger.warn('[SettingsStore] Failed to sync DEBUG_MODE with logging system:', error)
    }
  }

  // Handle COMPONENT_LOG_LEVELS changes and sync with logging system
  const handleComponentLogLevelsChange = async (levels) => {
    try {
      const { debugModeBridge } = await import('@/shared/logging/DebugModeBridge.js')
      debugModeBridge.handleComponentLogLevelsChange(levels)
      
      logger.info('[SettingsStore] COMPONENT_LOG_LEVELS changed and synced with logging system', {
        levels,
        source: 'storage_change'
      })
    } catch (error) {
      logger.warn('[SettingsStore] Failed to sync COMPONENT_LOG_LEVELS with logging system:', error)
    }
  }

  // Setup storage listener using StorageManager
  const setupStorageListener = async () => {
    try {
      storageListener = handleStorageChange
  storageManager.on('change', storageListener)
  if (settings.value.DEBUG_MODE) logger.info('[SettingsStore] Listener setup')
    } catch (error) {
      logger.warn('[SettingsStore] Unable to setup storage listener:', error.message)
    }
  }

  // Cleanup storage listener using StorageManager
  const cleanupStorageListener = async () => {
    if (!storageListener) return;
    try {
      storageManager.off('change', storageListener);
      storageListener = null;
  if (settings.value.DEBUG_MODE) logger.info('[SettingsStore] Listener cleaned up');
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'settings-store-cleanup');
      } else {
        logger.error('[SettingsStore] Error cleaning up storage listener:', error);
      }
    }
  }

  // Initialize settings on store creation and setup listener
  loadSettings().then(async () => {
    // Initialize DebugModeBridge after settings are loaded
    try {
      const { debugModeBridge } = await import('@/shared/logging/DebugModeBridge.js')
      await debugModeBridge.initialize()

      logger.info('[SettingsStore] DebugModeBridge initialized successfully', {
        currentDebugMode: settings.value.DEBUG_MODE
      })
    } catch (error) {
      logger.warn('[SettingsStore] Failed to initialize DebugModeBridge:', error)
    }
  }).catch(error => {
    logger.error('Failed to initialize settings store:', error)
  })

  // Cleanup listener on store destruction - only if we're in a component context
  const instance = getCurrentInstance()
  if (instance) {
    onUnmounted(() => {
      cleanupStorageListener()
    })
  }
  // Note: If not in component context, cleanup will happen when browser extension unloads
  
  return {
    // State
    settings,
    isLoading,
    isInitialized,
    isSaving,
    isSettingsValid,
    
    // Getters
    isDarkTheme,
    canTranslate,
    sourceLanguage,
    targetLanguage,
    selectedProvider,
    fontFamily,
    fontSize,
    
    // Actions
    loadSettings,
    saveAllSettings,
    updateSettingLocally,
    updateSettingAndPersist,
    updateMultipleSettings,
    resetSettings,
    exportSettings,
    importSettings,
    getSetting,
    validateSettings,
    $reset
  }
})

export default useSettingsStore