// src/composables/useLanguages.js
// Composable for language management

import { computed } from 'vue'
import { languageList } from '@/utils/languages.js'

/**
 * Composable for managing different types of languages in the extension
 */
export function useLanguages() {
  /**
   * Get all available translation languages
   * @returns {Array} Array of translation languages with code and name
   */
  const getTranslationLanguages = () => {
    return languageList.map(lang => ({
      code: lang.code,
      name: lang.name,
      promptName: lang.promptName,
      voiceCode: lang.voiceCode,
      flagCode: lang.flagCode
    }))
  }

  /**
   * Get source languages (includes auto-detect)
   * @returns {Array} Array of source languages including auto-detect
   */
  const getSourceLanguages = () => {
    return [
      { code: 'auto', name: 'Auto Detect', promptName: 'Auto Detect' },
      ...getTranslationLanguages()
    ]
  }

  /**
   * Get target languages (excludes auto-detect)
   * @returns {Array} Array of target languages
   */
  const getTargetLanguages = () => {
    return getTranslationLanguages()
  }

  /**
   * Get interface languages (only available UI locales)
   * @returns {Array} Array of interface languages
   */
  const getInterfaceLanguages = () => {
    return [
      { code: 'en', name: 'English' },
      { code: 'fa', name: 'فارسی' }
    ]
  }

  /**
   * Find language by code
   * @param {string} code - Language code
   * @returns {Object|null} Language object or null if not found
   */
  const findLanguageByCode = (code) => {
    if (code === 'auto') {
      return { code: 'auto', name: 'Auto Detect', promptName: 'Auto Detect' }
    }
    return languageList.find(lang => lang.code === code) || null
  }

  /**
   * Get language name by code
   * @param {string} code - Language code
   * @returns {string} Language name or code if not found
   */
  const getLanguageName = (code) => {
    const language = findLanguageByCode(code)
    return language ? language.name : code
  }

  // Computed reactive references
  const translationLanguages = computed(() => getTranslationLanguages())
  const sourceLanguages = computed(() => getSourceLanguages())
  const targetLanguages = computed(() => getTargetLanguages())
  const interfaceLanguages = computed(() => getInterfaceLanguages())

  return {
    // Functions
    getTranslationLanguages,
    getSourceLanguages,
    getTargetLanguages,
    getInterfaceLanguages,
    findLanguageByCode,
    getLanguageName,
    
    // Computed refs
    translationLanguages,
    sourceLanguages,
    targetLanguages,
    interfaceLanguages
  }
}