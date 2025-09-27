// src/utils/UtilsFactory.js
// Factory for lazy loading utils modules to enable better code splitting

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// Lazy initialization to avoid TDZ issues
let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.UTILS, 'UtilsFactory');
  }
  return logger;
};

/**
 * Factory class for lazy loading utils modules
 * This enables Vite to split utils into separate chunks
 */
class UtilsFactory {
  constructor() {
    // Cache for loaded modules
    this.loadedModules = new Map();
    // Loading promises to prevent duplicate loads
    this.loadingPromises = new Map();
    // Modules that need TDZ-safe loading
    this.tzdSafeModules = new Set(['i18n', 'languages', 'text', 'ui', 'browser']);
  }

  /**
   * TDZ-Safe module loader for problematic modules
   */
  async getModuleSafe(moduleName) {
    if (this.tzdSafeModules.has(moduleName)) {
      return await this._loadTzdSafeModule(moduleName);
    }
    // Fallback to regular loading
    switch (moduleName) {
      case 'i18n':
        return await this.getI18nUtils();
      case 'browser':
        return await this.getBrowserUtils();
      case 'text':
        return await this.getTextUtils();
      case 'ui':
        return await this.getUIUtils();
      default:
        throw new Error(`Unknown module: ${moduleName}`);
    }
  }

  async _loadTzdSafeModule(moduleName) {
    getLogger().debug(`Loading ${moduleName} utils with TDZ-safe mode`);

    try {
      // Use dynamic import to avoid TDZ during module evaluation
      switch (moduleName) {
        case 'i18n':
          return await this._loadI18nUtilsTzdSafe();
        case 'languages':
          return await this._loadLanguagesUtilsTzdSafe();
        default:
          return await this.getModule(moduleName);
      }
    } catch (error) {
      getLogger().error(`Failed to load ${moduleName} in TDZ-safe mode:`, error);
      // Fallback to regular loading
      return await this.getModule(moduleName);
    }
  }

  /**
   * Load i18n utilities lazily
   */
  async getI18nUtils() {
    if (this.loadedModules.has('i18n')) {
      return this.loadedModules.get('i18n');
    }

    if (this.loadingPromises.has('i18n')) {
      return await this.loadingPromises.get('i18n');
    }

    const loadingPromise = this._loadI18nUtils();
    this.loadingPromises.set('i18n', loadingPromise);

    const utils = await loadingPromise;
    this.loadedModules.set('i18n', utils);
    this.loadingPromises.delete('i18n');

    return utils;
  }

  async _loadI18nUtils() {
    getLogger().debug('Loading i18n utils lazily');

    const [
      i18nUtils,
      languagesUtils,
      pluginModule,
      languagePackLoader,
      lazyLoader,
      languageDetector
    ] = await Promise.all([
      import('./i18n/i18n.js'),
      import('./i18n/languages.js'),
      import('./i18n/plugin.js'),
      import('./i18n/LanguagePackLoader.js'),
      import('./i18n/LazyLanguageLoader.js'),
      import('./i18n/LanguageDetector.js')
    ]);

    // Preload core languages in background
    languagePackLoader.preloadCoreLanguagePacks().catch(err => {
      getLogger().debug('Failed to preload core languages:', err);
    });

    // Preload user languages based on preferences
    lazyLoader.preloadUserLanguages().catch(err => {
      getLogger().debug('Failed to preload user languages:', err);
    });

    return {
      ...i18nUtils,
      ...languagesUtils,
      i18nPlugin: pluginModule.default,
      setI18nLocale: pluginModule.setI18nLocale,
      languagePackLoader: {
        preloadCoreLanguagePacks: languagePackLoader.preloadCoreLanguagePacks,
        loadLanguagePack: languagePackLoader.loadLanguagePack,
        loadLanguagePackByType: languagePackLoader.loadLanguagePackByType,
        isLanguagePackAvailable: languagePackLoader.isLanguagePackAvailable,
        isLanguagePackAvailableByType: languagePackLoader.isLanguagePackAvailableByType,
        getLanguagePackCacheInfo: languagePackLoader.getLanguagePackCacheInfo
      },
      lazyLanguageLoader: {
        lazyLoadTranslationLanguage: lazyLoader.lazyLoadTranslationLanguage,
        lazyLoadInterfaceLanguage: lazyLoader.lazyLoadInterfaceLanguage,
        lazyLoadTtsLanguage: lazyLoader.lazyLoadTtsLanguage,
        preloadUserLanguages: lazyLoader.preloadUserLanguages,
        getLanguageDataLazy: lazyLoader.getLanguageDataLazy,
        detectLanguageLazy: lazyLoader.detectLanguageLazy,
        clearLazyLoadCache: lazyLoader.clearLazyLoadCache,
        getLazyLoadCacheInfo: lazyLoader.getLazyLoadCacheInfo
      },
      languageDetector: {
        detectBrowserLanguage: languageDetector.detectBrowserLanguage,
        detectLanguageFromText: languageDetector.detectLanguageFromText,
        clearDetectionCache: languageDetector.clearDetectionCache,
        getDetectionCacheInfo: languageDetector.getDetectionCacheInfo,
        configureDetection: languageDetector.configureDetection,
        getSupportedDetectionLanguages: languageDetector.getSupportedDetectionLanguages
      }
    };
  }

  async _loadI18nUtilsTzdSafe() {
    getLogger().debug('Loading i18n utils with TDZ-safe mode');

    // Load modules one by one to avoid TDZ
    const i18nModule = await import('./i18n/i18n.js');
    const languagesModule = await import('./i18n/languages.js');
    const pluginModule = await import('./i18n/plugin.js');
    const languagePackLoader = await import('./i18n/LanguagePackLoader.js');
    const lazyLoader = await import('./i18n/LazyLanguageLoader.js');
    const languageDetector = await import('./i18n/LanguageDetector.js');

    // Preload core languages in background
    languagePackLoader.preloadCoreLanguagePacks().catch(err => {
      getLogger().debug('Failed to preload core languages:', err);
    });

    // Preload user languages based on preferences
    lazyLoader.preloadUserLanguages().catch(err => {
      getLogger().debug('Failed to preload user languages:', err);
    });

    return {
      ...i18nModule,
      ...languagesModule,
      i18nPlugin: pluginModule.default,
      setI18nLocale: pluginModule.setI18nLocale,
      languagePackLoader: {
        preloadCoreLanguagePacks: languagePackLoader.preloadCoreLanguagePacks,
        loadLanguagePack: languagePackLoader.loadLanguagePack,
        loadLanguagePackByType: languagePackLoader.loadLanguagePackByType,
        isLanguagePackAvailable: languagePackLoader.isLanguagePackAvailable,
        isLanguagePackAvailableByType: languagePackLoader.isLanguagePackAvailableByType,
        getLanguagePackCacheInfo: languagePackLoader.getLanguagePackCacheInfo
      },
      lazyLanguageLoader: {
        lazyLoadTranslationLanguage: lazyLoader.lazyLoadTranslationLanguage,
        lazyLoadInterfaceLanguage: lazyLoader.lazyLoadInterfaceLanguage,
        lazyLoadTtsLanguage: lazyLoader.lazyLoadTtsLanguage,
        preloadUserLanguages: lazyLoader.preloadUserLanguages,
        getLanguageDataLazy: lazyLoader.getLanguageDataLazy,
        detectLanguageLazy: lazyLoader.detectLanguageLazy,
        clearLazyLoadCache: lazyLoader.clearLazyLoadCache,
        getLazyLoadCacheInfo: lazyLoader.getLazyLoadCacheInfo
      },
      languageDetector: {
        detectBrowserLanguage: languageDetector.detectBrowserLanguage,
        detectLanguageFromText: languageDetector.detectLanguageFromText,
        clearDetectionCache: languageDetector.clearDetectionCache,
        getDetectionCacheInfo: languageDetector.getDetectionCacheInfo,
        configureDetection: languageDetector.configureDetection,
        getSupportedDetectionLanguages: languageDetector.getSupportedDetectionLanguages
      }
    };
  }

  async _loadLanguagesUtilsTzdSafe() {
    getLogger().debug('Loading languages utils with TDZ-safe mode');

    const languagesModule = await import('./i18n/languages.js');

    return {
      getLanguageCodeForTTS: languagesModule.getLanguageCodeForTTS,
      normalizeLanguageCode: languagesModule.normalizeLanguageCode,
      languageList: languagesModule.languageList
    };
  }

  /**
   * Load browser utilities lazily
   */
  async getBrowserUtils() {
    if (this.loadedModules.has('browser')) {
      return this.loadedModules.get('browser');
    }

    if (this.loadingPromises.has('browser')) {
      return await this.loadingPromises.get('browser');
    }

    const loadingPromise = this._loadBrowserUtils();
    this.loadingPromises.set('browser', loadingPromise);

    const utils = await loadingPromise;
    this.loadedModules.set('browser', utils);
    this.loadingPromises.delete('browser');

    return utils;
  }

  async _loadBrowserUtils() {
    getLogger().debug('Loading browser utils lazily');

    const [
      platformUtils,
      eventsUtils,
      compatibilityUtils,
      iconManagerModule
    ] = await Promise.all([
      import('./browser/platform.js'),
      import('./browser/events.js'),
      import('./browser/compatibility.js'),
      import('./browser/ActionbarIconManager.js')
    ]);

    return {
      ...platformUtils,
      ...eventsUtils,
      ...compatibilityUtils,
      ActionbarIconManager: iconManagerModule.default || iconManagerModule.ActionbarIconManager,
      getActionbarIconManager: iconManagerModule.getActionbarIconManager
    };
  }

  /**
   * Load text processing utilities lazily
   */
  async getTextUtils() {
    if (this.loadedModules.has('text')) {
      return this.loadedModules.get('text');
    }

    if (this.loadingPromises.has('text')) {
      return await this.loadingPromises.get('text');
    }

    const loadingPromise = this._loadTextUtils();
    this.loadingPromises.set('text', loadingPromise);

    const utils = await loadingPromise;
    this.loadedModules.set('text', utils);
    this.loadingPromises.delete('text');

    return utils;
  }

  async _loadTextUtils() {
    getLogger().debug('Loading text utils lazily');

    const [
      rendererModule
    ] = await Promise.all([
      import('./rendering/TranslationRenderer.js')
    ]);

    return {
      TranslationRenderer: rendererModule.TranslationRenderer
    };
  }

  /**
   * Load UI utilities lazily
   */
  async getUIUtils() {
    if (this.loadedModules.has('ui')) {
      return this.loadedModules.get('ui');
    }

    if (this.loadingPromises.has('ui')) {
      return await this.loadingPromises.get('ui');
    }

    const loadingPromise = this._loadUIUtils();
    this.loadingPromises.set('ui', loadingPromise);

    const utils = await loadingPromise;
    this.loadedModules.set('ui', utils);
    this.loadingPromises.delete('ui');

    return utils;
  }

  async _loadUIUtils() {
    getLogger().debug('Loading UI utils lazily');

    const [
      themeUtils,
      exclusionUtils,
      htmlSanitizerUtils
    ] = await Promise.all([
      import('./ui/theme.js'),
      import('./ui/exclusion.js'),
      import('./ui/html-sanitizer.js')
    ]);

    return {
      ...themeUtils,
      ...exclusionUtils,
      ...htmlSanitizerUtils
    };
  }

  /**
   * Load security utilities lazily
   */
  async getSecurityUtils() {
    if (this.loadedModules.has('security')) {
      return this.loadedModules.get('security');
    }

    if (this.loadingPromises.has('security')) {
      return await this.loadingPromises.get('security');
    }

    const loadingPromise = this._loadSecurityUtils();
    this.loadingPromises.set('security', loadingPromise);

    const utils = await loadingPromise;
    this.loadedModules.set('security', utils);
    this.loadingPromises.delete('security');

    return utils;
  }

  async _loadSecurityUtils() {
    getLogger().debug('Loading security utils lazily');

    const [
      secureStorageModule
    ] = await Promise.all([
      import('./secureStorage.js')
    ]);

    return {
      ...secureStorageModule
    };
  }

  /**
   * Load provider utilities lazily
   */
  async getProviderUtils() {
    if (this.loadedModules.has('provider')) {
      return this.loadedModules.get('provider');
    }

    if (this.loadingPromises.has('provider')) {
      return await this.loadingPromises.get('provider');
    }

    const loadingPromise = this._loadProviderUtils();
    this.loadingPromises.set('provider', loadingPromise);

    const utils = await loadingPromise;
    this.loadedModules.set('provider', utils);
    this.loadingPromises.delete('provider');

    return utils;
  }

  async _loadProviderUtils() {
    getLogger().debug('Loading provider utils lazily');

    const [
      providerHtmlModule
    ] = await Promise.all([
      import('./providerHtmlGenerator.js')
    ]);

    return {
      ...providerHtmlModule
    };
  }

  /**
   * Load core utilities (small, frequently used)
   */
  async getCoreUtils() {
    if (this.loadedModules.has('core')) {
      return this.loadedModules.get('core');
    }

    if (this.loadingPromises.has('core')) {
      return await this.loadingPromises.get('core');
    }

    const loadingPromise = this._loadCoreUtils();
    this.loadingPromises.set('core', loadingPromise);

    const utils = await loadingPromise;
    this.loadedModules.set('core', utils);
    this.loadingPromises.delete('core');

    return utils;
  }

  async _loadCoreUtils() {
    getLogger().debug('Loading core utils lazily');

    const [
      messageIdModule
    ] = await Promise.all([
      import('./messaging/messageId.js')
    ]);

    return {
      ...messageIdModule
    };
  }

  /**
   * Clear all cached modules (useful for testing/development)
   */
  clearCache() {
    getLogger().debug('Clearing utils factory cache');
    this.loadedModules.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get loading status for debugging
   */
  getStatus() {
    return {
      loadedModules: Array.from(this.loadedModules.keys()),
      loadingPromises: Array.from(this.loadingPromises.keys())
    };
  }
}

// Export singleton instance
export const utilsFactory = new UtilsFactory();

// Export class for testing
export { UtilsFactory };