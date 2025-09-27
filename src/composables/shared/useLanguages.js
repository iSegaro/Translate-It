// src/composables/useLanguages.js
// Composable for language management

import { ref, computed } from "vue";
import { utilsFactory } from "@/utils/UtilsFactory.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// Lazy logger initialization to avoid TDZ issues
let logger = null;
function getLogger() {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.UI, 'useLanguages');
  }
  return logger;
}

// Shared state for cache optimization
let sharedState = {
  loadingPromise: null,
  isLoaded: false
};


/**
 * Composable for managing different types of languages in the extension
 */
export function useLanguages() {
  // State
  const isLoaded = ref(false);
  const languages = ref([]);

  /**
   * Load languages list asynchronously using the utils factory
   * @returns {Promise<void>}
   */
  const loadLanguages = async () => {
    // Return immediately if languages are already loaded globally
    if (sharedState.isLoaded) {
      // Update local state from shared state if needed
      if (!isLoaded.value && sharedState.languageList) {
        languages.value = sharedState.languageList;
        isLoaded.value = true;
      }
      return;
    }

    // Return existing loading promise to prevent duplicate requests
    if (sharedState.loadingPromise) {
      await sharedState.loadingPromise;
      return;
    }

    // Create new loading promise
    sharedState.loadingPromise = (async () => {
      try {
        const { getFullLanguageList } = await utilsFactory.getI18nUtils();
        const languageList = await getFullLanguageList() || [];

        // Update shared state
        sharedState.languageList = languageList;
        sharedState.isLoaded = true;

        // Update component state
        languages.value = languageList;
        isLoaded.value = true;

        getLogger().init('Languages loaded successfully:', languages.value.length);
      } catch (error) {
        getLogger().error('Failed to load languages:', error);
        // In case of error, use an empty list but mark as loaded
        languages.value = [];
        isLoaded.value = true;
        sharedState.isLoaded = true;
      } finally {
        // Clear loading promise
        sharedState.loadingPromise = null;
      }
    })();

    await sharedState.loadingPromise;
  };

  /**
   * Get all available translation languages
   * @returns {Array} Array of translation languages with code and name
   */
  const getTranslationLanguages = () => {
    return (languages.value || []).map((lang) => ({
      code: lang.code,
      name: lang.name,
      promptName: lang.promptName,
      voiceCode: lang.voiceCode,
      flagCode: lang.flagCode,
    }));
  };

  /**
   * Get source languages (includes auto-detect)
   * @returns {Array} Array of source languages including auto-detect
   */
  const getSourceLanguages = () => {
    return [
      { code: "auto", name: "Auto-Detect", promptName: "Auto Detect" },
      ...getTranslationLanguages(),
    ];
  };

  /**
   * Get target languages (excludes auto-detect)
   * @returns {Array} Array of target languages
   */
  const getTargetLanguages = () => {
    return getTranslationLanguages();
  };

  /**
   * Get interface languages (only available UI locales)
   * @returns {Array} Array of interface languages
   */
  const getInterfaceLanguages = () => {
    return [
      { code: "en", name: "English" },
      { code: "fa", name: "فارسی" },
    ];
  };

  /**
   * Find language by code
   * @param {string} code - Language code
   * @returns {Object|null} Language object or null if not found
   */
  const findLanguageByCode = (code) => {
    if (code === "auto") {
      return { code: "auto", name: "Auto-Detect", promptName: "Auto Detect" };
    }
    return (languages.value || []).find((lang) => lang.code === code) || null;
  };

  /**
   * Get language name by code
   * @param {string} code - Language code
   * @returns {string} Language name or code if not found
   */
  const getLanguageName = (code) => {
    const language = findLanguageByCode(code);
    return language ? language.name : code;
  };

  /**
   * Get language prompt name by display name or code
   * @param {string} identifier - Language display name or code
   * @returns {string} Language prompt name or identifier if not found
   */
  const getLanguagePromptName = (identifier) => {
    if (!identifier) return null;

    // Check if it's auto-detect
    if (identifier === "Auto-Detect" || identifier === "auto") {
      return "auto";
    }

    const langList = languages.value || [];

    // Find by name (display value)
    const langByName = langList.find((lang) => lang.name === identifier);
    if (langByName) {
      return langByName.promptName || langByName.code;
    }

    // Find by code
    const langByCode = langList.find((lang) => lang.code === identifier);
    if (langByCode) {
      return langByCode.promptName || langByCode.code;
    }

    return identifier;
  };

  /**
   * Get language display value by code
   * @param {string} code - Language code
   * @returns {string} Language display name or code if not found
   */
  const getLanguageDisplayValue = (code) => {
    if (!code) return null;

    if (code === "auto") {
      return "Auto-Detect";
    }

    const langList = languages.value || [];
    const language = langList.find((lang) => lang.code === code);
    return language ? language.name : code;
  };

  // Computed reactive references
  const allLanguages = computed(() => languages.value || []);
  const translationLanguages = computed(() => getTranslationLanguages());
  const sourceLanguages = computed(() => getSourceLanguages());
  const targetLanguages = computed(() => getTargetLanguages());
  const interfaceLanguages = computed(() => getInterfaceLanguages());

  return {
    // State
    isLoaded,
    allLanguages,

    // Functions
    loadLanguages,
    getTranslationLanguages,
    getSourceLanguages,
    getTargetLanguages,
    getInterfaceLanguages,
    findLanguageByCode,
    getLanguageName,
    getLanguagePromptName,
    getLanguageDisplayValue,

    // Computed refs
    translationLanguages,
    sourceLanguages,
    targetLanguages,
    interfaceLanguages,
  };
}
