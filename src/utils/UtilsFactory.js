// src/utils/UtilsFactory.js
// Factory for loading utils modules with optimized splitting

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";

// Static imports for core utilities (lightweight and frequently used)
import * as eventsUtils from "./browser/events.js";
import * as compatibilityUtils from "./browser/compatibility.js";
import getActionbarIconManager, {
  ActionbarIconManager,
} from "./browser/ActionbarIconManager.js";
import * as themeUtils from "./ui/theme.js";
import * as exclusionUtils from "./ui/exclusion.js";
import * as htmlSanitizerUtils from "./ui/html-sanitizer.js";
import * as secureStorageModule from "./secureStorage.js";
import * as messageIdModule from "./messaging/messageId.js";

const logger = getScopedLogger(LOG_COMPONENTS.UTILS, "UtilsFactory");

/**
 * Factory class for utils modules
 * Uses static imports for core utils and dynamic imports for heavy modules (i18n)
 */
class UtilsFactory {
  constructor() {
    // Cache for loaded modules
    this.loadedModules = new Map();
    // Loading promises to prevent duplicate loads
    this.loadingPromises = new Map();

    // Initialize static modules in cache
    this._initializeStaticModules();
  }

  _initializeStaticModules() {
    // Browser Utils
    const legacyCompatibility = {
      ...compatibilityUtils,
      detectPlatform: compatibilityUtils.detectOS,
      Platform: compatibilityUtils.OS_PLATFORMS,
    };

    this.loadedModules.set("browser", {
      ...eventsUtils,
      ...legacyCompatibility,
      ActionbarIconManager,
      getActionbarIconManager,
    });

    // UI Utils
    this.loadedModules.set("ui", {
      ...themeUtils,
      ...exclusionUtils,
      ...htmlSanitizerUtils,
    });

    // Security Utils
    this.loadedModules.set("security", {
      ...secureStorageModule,
    });

    // Core Utils
    this.loadedModules.set("core", {
      ...messageIdModule,
    });
  }

  /**
   * Sync getter for core modules (since they are now static)
   */
  getModuleSync(moduleName) {
    return this.loadedModules.get(moduleName);
  }

  /**
   * Async module loader for compatibility
   */
  async getModuleSafe(moduleName) {
    if (moduleName === "i18n" || moduleName === "languages") {
      return await this.getI18nUtils();
    }
    return this.loadedModules.get(moduleName);
  }

  /**
   * Load i18n utilities lazily (remain dynamic due to size)
   */
  async getI18nUtils() {
    if (this.loadedModules.has("i18n")) {
      return this.loadedModules.get("i18n");
    }

    if (this.loadingPromises.has("i18n")) {
      return await this.loadingPromises.get("i18n");
    }

    const loadingPromise = this._loadI18nUtils();
    this.loadingPromises.set("i18n", loadingPromise);

    const utils = await loadingPromise;
    this.loadedModules.set("i18n", utils);
    this.loadingPromises.delete("i18n");

    return utils;
  }

  async _loadI18nUtils() {
    logger.debug("Loading i18n utils lazily");

    try {
      const [
        i18nUtils,
        languagesUtils,
        pluginModule,
        languagePackLoader,
        lazyLoader,
      ] = await Promise.all([
        import("./i18n/i18n.js"),
        import("./i18n/languages.js"),
        import("./i18n/plugin.js"),
        import("./i18n/LanguagePackLoader.js"),
        import("./i18n/LazyLanguageLoader.js"),
      ]);

      // Preload core languages in background
      languagePackLoader.preloadCoreLanguagePacks().catch((err) => {
        logger.debug("Failed to preload core languages:", err);
      });

      // Preload user languages based on preferences
      lazyLoader.preloadUserLanguages().catch((err) => {
        logger.debug("Failed to preload user languages:", err);
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
          isLanguagePackAvailableByType:
            languagePackLoader.isLanguagePackAvailableByType,
          getLanguagePackCacheInfo: languagePackLoader.getLanguagePackCacheInfo,
        },
        lazyLanguageLoader: {
          lazyLoadTranslationLanguage: lazyLoader.lazyLoadTranslationLanguage,
          lazyLoadInterfaceLanguage: lazyLoader.lazyLoadInterfaceLanguage,
          lazyLoadTtsLanguage: lazyLoader.lazyLoadTtsLanguage,
          preloadUserLanguages: lazyLoader.preloadUserLanguages,
          getLanguageDataLazy: lazyLoader.getLanguageDataLazy,
          detectLanguageLazy: lazyLoader.detectLanguageLazy,
          clearLazyLoadCache: lazyLoader.clearLazyLoadCache,
          getLazyLoadCacheInfo: lazyLoader.getLazyLoadCacheInfo,
        },
      };
    } catch (error) {
      logger.error("Failed to load i18n utils:", error);
      throw error;
    }
  }

  /**
   * Load browser utilities (now returns sync but kept async for API compatibility)
   */
  async getBrowserUtils() {
    return this.loadedModules.get("browser");
  }

  /**
   * Load text processing utilities lazily
   */
  async getTextUtils() {
    if (this.loadedModules.has("text")) {
      return this.loadedModules.get("text");
    }

    const { TranslationRenderer } =
      await import("./rendering/TranslationRenderer.js");
    const utils = { TranslationRenderer };
    this.loadedModules.set("text", utils);
    return utils;
  }

  /**
   * Load UI utilities
   */
  async getUIUtils() {
    return this.loadedModules.get("ui");
  }

  /**
   * Load security utilities
   */
  async getSecurityUtils() {
    return this.loadedModules.get("security");
  }

  /**
   * Load core utilities
   */
  async getCoreUtils() {
    return this.loadedModules.get("core");
  }

  /**
   * Clear all cached modules (only clears dynamic ones)
   */
  clearCache() {
    logger.debug("Clearing utils factory dynamic cache");
    const browser = this.loadedModules.get("browser");
    const ui = this.loadedModules.get("ui");
    const security = this.loadedModules.get("security");
    const core = this.loadedModules.get("core");

    this.loadedModules.clear();
    this.loadingPromises.clear();

    // Restore static ones
    this.loadedModules.set("browser", browser);
    this.loadedModules.set("ui", ui);
    this.loadedModules.set("security", security);
    this.loadedModules.set("core", core);
  }

  /**
   * Get loading status for debugging
   */
  getStatus() {
    return {
      loadedModules: Array.from(this.loadedModules.keys()),
      loadingPromises: Array.from(this.loadingPromises.keys()),
    };
  }
}

// Export singleton instance
export const utilsFactory = new UtilsFactory();

// Export class for testing
export { UtilsFactory };
