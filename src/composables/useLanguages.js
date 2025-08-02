// src/composables/useLanguages.js
// Composable for language management

import { ref, computed } from "vue";
import { languageList } from "@/utils/i18n/languages.js";
import { logME } from "@/utils/core/helpers.js";

/**
 * Composable for managing different types of languages in the extension
 */
export function useLanguages() {
  // State
  const isLoaded = ref(false);
  const languages = ref([]);

  /**
   * Load languages list
   * @returns {Promise<void>}
   */
  const loadLanguages = async () => {
    try {
      if (!isLoaded.value) {
        // زبان‌ها از فایل استاتیک بارگذاری می‌شوند
        languages.value = languageList || [];
        isLoaded.value = true;
        logME(
          "[useLanguages] Languages loaded successfully:",
          languages.value.length,
        );
      }
    } catch (error) {
      logME("[useLanguages] Failed to load languages:", error);
      // در صورت خطا، از لیست خالی استفاده می‌کنیم
      languages.value = [];
      isLoaded.value = true;
    }
  };

  /**
   * Get all available translation languages
   * @returns {Array} Array of translation languages with code and name
   */
  const getTranslationLanguages = () => {
    return (languages.value || languageList || []).map((lang) => ({
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
      { code: "auto", name: "Auto Detect", promptName: "Auto Detect" },
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
      return { code: "auto", name: "Auto Detect", promptName: "Auto Detect" };
    }
    const langList = languages.value || languageList || [];
    return langList.find((lang) => lang.code === code) || null;
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

    const langList = languages.value || languageList || [];

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

    const langList = languages.value || languageList || [];
    const language = langList.find((lang) => lang.code === code);
    return language ? language.name : code;
  };

  // Computed reactive references
  const allLanguages = computed(() => {
    if (!isLoaded.value) {
      // اگر هنوز load نشده، از languageList استاتیک استفاده کنیم
      return languageList || [];
    }
    return languages.value || [];
  });

  const translationLanguages = computed(() => getTranslationLanguages());
  const sourceLanguages = computed(() => getSourceLanguages());
  const targetLanguages = computed(() => getTargetLanguages());
  const interfaceLanguages = computed(() => getInterfaceLanguages());

  // Auto-load در صورت دسترسی به languageList
  if (languageList && languageList.length > 0 && !isLoaded.value) {
    loadLanguages();
  }

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
