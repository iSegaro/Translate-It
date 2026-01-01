// src/composables/shared/useProviderLanguages.js
// Composable for provider-specific language filtering

import { computed } from "vue";
import { useSettingsStore } from "@/features/settings/stores/settings.js";
import { getDeeplBetaLanguagesEnabledAsync } from "@/shared/config/config.js";
import { PROVIDER_SUPPORTED_LANGUAGES } from "@/shared/config/languageConstants.js";

/**
 * Composable for filtering languages based on selected provider
 * @param {Function} getAllLanguages - Function that returns all available languages
 * @returns {Object} Filtered source and target languages
 */
export function useProviderLanguages(getAllLanguages) {
  const settingsStore = useSettingsStore();

  /**
   * Get the list of supported language codes for the current provider
   * Returns null if provider supports all languages
   */
  const getProviderSupportedCodes = computed(() => {
    const provider = settingsStore.selectedProvider;

    // AI providers support all languages
    if (['gemini', 'openai', 'openrouter', 'deepseek', 'webai', 'custom'].includes(provider)) {
      return null; // null = no filtering
    }

    // Handle DeepL with beta languages toggle
    if (provider === 'deepl') {
      // Note: This is a reactive check, but the async nature means we need to handle it carefully
      // We'll return the base list and let the caller handle beta
      return PROVIDER_SUPPORTED_LANGUAGES.deepl;
    }

    // Return supported languages for the provider
    return PROVIDER_SUPPORTED_LANGUAGES[provider] || null;
  });

  /**
   * Filter languages based on provider support
   * @param {Array} languages - All available languages
   * @param {Boolean} includeAuto - Whether to include auto-detect
   * @returns {Array} Filtered languages
   */
  const filterLanguagesByProvider = (languages, includeAuto = false) => {
    const supportedCodes = getProviderSupportedCodes.value;

    // If provider supports all languages, return as-is
    if (supportedCodes === null) {
      return languages;
    }

    // Normalize supported codes for comparison (handle case and variants)
    const normalizedSupportedCodes = new Set(
      supportedCodes.map(code => code.toLowerCase().replace('-', ''))
    );

    // Filter languages that are supported by the provider
    const filtered = languages.filter(lang => {
      if (lang.code === 'auto') return includeAuto;
      const normalizedCode = lang.code.toLowerCase().replace('-', '');
      return normalizedSupportedCodes.has(normalizedCode);
    });

    return filtered;
  };

  /**
   * Get filtered source languages (includes auto-detect)
   */
  const getFilteredSourceLanguages = (allLanguages) => {
    return filterLanguagesByProvider(allLanguages, true);
  };

  /**
   * Get filtered target languages (excludes auto-detect)
   */
  const getFilteredTargetLanguages = (allLanguages) => {
    return filterLanguagesByProvider(allLanguages, false);
  };

  return {
    getProviderSupportedCodes,
    filterLanguagesByProvider,
    getFilteredSourceLanguages,
    getFilteredTargetLanguages,
  };
}

/**
 * Watch DeepL beta languages setting and return filtered languages
 * This is specifically for handling the DeepL beta toggle
 */
export function useDeepLLanguages(allLanguages) {
  const settingsStore = useSettingsStore();

  /**
   * Get DeepL supported languages based on beta setting
   */
  const getDeepLLanguages = computed(() => {
    const isDeepL = settingsStore.selectedProvider === 'deepl';

    if (!isDeepL) {
      // Not DeepL, return all languages
      return allLanguages.value;
    }

    // Get beta setting (sync fallback for reactivity)
    const betaEnabled = settingsStore.settings?.DEEPL_BETA_LANGUAGES_ENABLED ?? true;

    // Get supported codes based on beta setting
    const supportedCodes = betaEnabled
      ? PROVIDER_SUPPORTED_LANGUAGES.deepl_beta
      : PROVIDER_SUPPORTED_LANGUAGES.deepl;

    const normalizedSupportedCodes = new Set(
      supportedCodes.map(code => code.toLowerCase().replace('-', ''))
    );

    // Filter languages
    const filtered = allLanguages.value.filter(lang => {
      if (lang.code === 'auto') return true;
      const normalizedCode = lang.code.toLowerCase().replace('-', '');
      return normalizedSupportedCodes.has(normalizedCode);
    });

    return filtered;
  });

  return {
    getDeepLLanguages,
  };
}
