import { 
  getWholePageLazyLoadingAsync, 
  getWholePageAutoTranslateOnDOMChangesAsync, 
  getWholePageRootMarginAsync, 
  getWholePageExcludedSelectorsAsync, 
  getWholePageAttributesToTranslateAsync, 
  getWholePageShowOriginalOnHoverAsync, 
  getWholePageTranslateAfterScrollStopAsync,
  getWholePageScrollStopDelayAsync,
  getTranslationApiAsync, 
  getTargetLanguageAsync,
  getModeProvidersAsync,
  getAIContextTranslationEnabledAsync,
  TranslationMode,
  CONFIG
} from '@/config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * PageTranslationSettingsLoader - Specialized utility for loading and formatting
 * settings for the PageTranslationManager.
 */
export class PageTranslationSettingsLoader {
  /**
   * Loads and formats all settings required for whole-page translation.
   * @param {Object} options - Override options (provider, targetLanguage)
   * @returns {Promise<Object>} Formatted settings object
   */
  static async load(options = {}) {
    const logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'SettingsLoader');

    // Load all settings in parallel for performance
    const settingsData = await Promise.all([
      getWholePageRootMarginAsync(),
      getModeProvidersAsync(),
      getTranslationApiAsync(),
      getTargetLanguageAsync(),
      getWholePageLazyLoadingAsync(),
      getWholePageAutoTranslateOnDOMChangesAsync(),
      getWholePageExcludedSelectorsAsync(),
      getWholePageAttributesToTranslateAsync(),
      getWholePageShowOriginalOnHoverAsync(),
      getWholePageTranslateAfterScrollStopAsync(),
      getWholePageScrollStopDelayAsync(),
      getAIContextTranslationEnabledAsync()
    ]);

    const [
      rawRootMargin,
      modeProviders,
      globalTranslationApi,
      targetLanguage,
      lazyLoading,
      autoTranslateOnDOMChanges,
      excludedSelectors,
      attributesToTranslate,
      showOriginalOnHover,
      translateAfterScrollStop,
      scrollStopDelay,
      aiContextTranslationEnabled
    ] = settingsData;

    // Formatting: Ensure rootMargin has unit
    const formattedRootMargin = rawRootMargin 
      ? (String(rawRootMargin).match(/px|%|em|rem|vh|vw$/) ? String(rawRootMargin) : `${rawRootMargin}px`) 
      : '150px';

    // Provider Resolution: Options -> Mode Provider -> Global Provider
    let effectiveProvider = options.provider;
    if (!effectiveProvider) {
      effectiveProvider = modeProviders?.[TranslationMode.Page] || globalTranslationApi;
    }

    const settings = {
      translationApi: effectiveProvider,
      targetLanguage: options.targetLanguage || targetLanguage,
      lazyLoading: !!lazyLoading,
      rootMargin: formattedRootMargin,
      autoTranslateOnDOMChanges: !!autoTranslateOnDOMChanges,
      excludedSelectors: excludedSelectors,
      attributesToTranslate: attributesToTranslate,
      showOriginalOnHover: !!showOriginalOnHover,
      translateAfterScrollStop: !!translateAfterScrollStop,
      scrollStopDelay: Number(scrollStopDelay) || 500,
      aiContextTranslationEnabled: !!aiContextTranslationEnabled,
      chunkSize: CONFIG.WHOLE_PAGE_CHUNK_SIZE,
      maxConcurrentFlushes: CONFIG.WHOLE_PAGE_MAX_CONCURRENT_REQUESTS
    };

    logger.debugLazy(() => [
      'Settings Loaded:', 
      { provider: settings.translationApi, onStop: settings.translateAfterScrollStop }
    ]);

    return settings;
  }
}
