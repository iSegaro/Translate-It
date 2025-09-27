// src/utils/i18n/index.js
// Main entry point for the optimized i18n system

// Core language loaders
export {
  loadLanguagePack,
  loadLanguagePackByType,
  preloadCoreLanguagePacks,
  getAvailableLanguageCodes,
  getAvailableLanguagesByType,
  isLanguagePackAvailable,
  isLanguagePackAvailableByType,
  clearLanguagePackCache,
  getLanguagePackCacheInfo
} from './LanguagePackLoader.js';

// Specialized loaders
export {
  loadTranslationLanguagePack,
  preloadCoreTranslationLanguagePacks,
  getAvailableTranslationLanguageCodes,
  isTranslationLanguagePackAvailable,
  clearTranslationLanguageCache,
  getTranslationLanguageCacheInfo
} from './TranslationLanguageLoader.js';

export {
  loadInterfaceLanguagePack,
  preloadCoreInterfaceLanguagePacks,
  getAvailableInterfaceLanguageCodes,
  isInterfaceLanguagePackAvailable,
  clearInterfaceLanguageCache,
  getInterfaceLanguageCacheInfo
} from './InterfaceLanguageLoader.js';

export {
  loadTtsLanguagePack,
  preloadCoreTtsLanguagePacks,
  getAvailableTtsLanguageCodes,
  isTtsLanguagePackAvailable,
  clearTtsLanguageCache,
  getTtsLanguageCacheInfo
} from './TtsLanguageLoader.js';

// Lazy loading utilities
export {
  lazyLoadTranslationLanguage,
  lazyLoadInterfaceLanguage,
  lazyLoadTtsLanguage,
  preloadUserLanguages,
  getLanguageDataLazy,
  detectLanguageLazy,
  clearLazyLoadCache,
  getLazyLoadCacheInfo
} from './LazyLanguageLoader.js';

// Language detection
export {
  detectBrowserLanguage,
  detectLanguageFromText,
  clearDetectionCache,
  getDetectionCacheInfo,
  configureDetection,
  getSupportedDetectionLanguages
} from './LanguageDetector.js';

// Main language utilities (with backward compatibility)
export {
  getLanguageData,
  getFullLanguageList,
  getLanguageCodeForTTS,
  getLanguageByCode,
  getLanguageByName,
  findLanguageCode,
  clearLanguageCache,
  getAvailableLanguagesByType,
  preloadLanguages,
  getLanguageByType,
  basicLanguageList
} from './languages.js';

// Main i18n functions
export {
  parseBoolean,
  getTranslationString,
  app_localize,
  clearTranslationsCache,
  clearTranslationCache
} from './i18n.js';

// Localization utilities
export {
  createI18n,
  setupI18n
} from './localization.js';

// Plugin
export { i18nPlugin } from './plugin.js';

// Helper utilities
export {
  fadeOutInElement,
  animatePopupEffect
} from './helper.js';