// src/utils/browser-unified.js
// Unified browser API layer for cross-browser compatibility

import { environment } from './environment.js';

/**
 * Unified Browser API class
 * Provides a consistent interface across Chrome and Firefox
 */
class UnifiedBrowserAPI {
  constructor() {
    this.api = null;
    this.initialized = false;
    this.polyfillPromise = null;
  }

  /**
   * Initialize the unified browser API
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await environment.initialize();
      
      const browser = environment.getBrowser();
      console.log(`🔗 Initializing unified API for ${browser}`);

      if (browser === 'firefox') {
        await this.initializeFirefoxAPI();
      } else if (browser === 'chrome') {
        await this.initializeChromeAPI();
      } else {
        throw new Error(`Unsupported browser: ${browser}`);
      }

      // Make API globally available
      this.makeGloballyAvailable();

      this.initialized = true;
      console.log('✅ Unified browser API initialized');

    } catch (error) {
      console.error('❌ Failed to initialize unified browser API:', error);
      throw error;
    }
  }

  /**
   * Initialize Firefox API
   * @private
   */
  async initializeFirefoxAPI() {
    if (typeof browser !== 'undefined') {
      // Firefox native API
      this.api = browser;
      console.log('🦊 Using Firefox native browser API');
    } else {
      // Import webextension-polyfill for Firefox
      try {
        const polyfill = await this.importPolyfill();
        this.api = polyfill;
        console.log('🦊 Using webextension-polyfill for Firefox');
      } catch (error) {
        console.error('Failed to load webextension-polyfill:', error);
        throw error;
      }
    }
  }

  /**
   * Initialize Chrome API
   * @private
   */
  async initializeChromeAPI() {
    if (typeof chrome !== 'undefined') {
      // Try to use webextension-polyfill for consistency
      try {
        const polyfill = await this.importPolyfill();
        this.api = polyfill;
        console.log('🌐 Using webextension-polyfill for Chrome');
      } catch (error) {
        // Fallback to native chrome API
        console.warn('webextension-polyfill not available, using native chrome API');
        this.api = this.wrapChromeAPI(chrome);
        console.log('🌐 Using wrapped Chrome native API');
      }
    } else {
      throw new Error('Chrome API not available');
    }
  }

  /**
   * Import webextension-polyfill dynamically
   * @private
   */
  async importPolyfill() {
    if (this.polyfillPromise) {
      return this.polyfillPromise;
    }

    this.polyfillPromise = (async () => {
      if (typeof browser !== 'undefined') {
        return browser;
      } else {
        throw new Error('webextension-polyfill not loaded globally.');
      }
    })();

    return this.polyfillPromise;
  }

  /**
   * Wrap Chrome API to provide promise-based interface similar to webextension-polyfill
   * @private
   */
  wrapChromeAPI(chromeAPI) {
    const wrapped = {};

    // Wrap common APIs
    wrapped.runtime = this.wrapRuntimeAPI(chromeAPI.runtime);
    wrapped.storage = this.wrapStorageAPI(chromeAPI.storage);
    wrapped.tabs = this.wrapTabsAPI(chromeAPI.tabs);
    wrapped.contextMenus = this.wrapContextMenusAPI(chromeAPI.contextMenus);
    wrapped.notifications = this.wrapNotificationsAPI(chromeAPI.notifications);
    
    // Chrome-specific APIs (optional)
    if (chromeAPI.sidePanel) {
      wrapped.sidePanel = chromeAPI.sidePanel;
    }
    if (chromeAPI.offscreen) {
      wrapped.offscreen = this.wrapOffscreenAPI(chromeAPI.offscreen);
    }
    if (chromeAPI.tts) {
      wrapped.tts = this.wrapTTSAPI(chromeAPI.tts);
    }

    return wrapped;
  }

  /**
   * Wrap Chrome runtime API
   * @private
   */
  wrapRuntimeAPI(runtime) {
    return {
      ...runtime,
      sendMessage: this.promisifyCallback(runtime.sendMessage.bind(runtime)),
      getManifest: runtime.getManifest.bind(runtime),
      getURL: runtime.getURL.bind(runtime),
      onMessage: runtime.onMessage,
      onInstalled: runtime.onInstalled,
      onConnect: runtime.onConnect,
      lastError: runtime.lastError,
      id: runtime.id
    };
  }

  /**
   * Wrap Chrome storage API
   * @private
   */
  wrapStorageAPI(storage) {
    return {
      local: {
        get: this.promisifyCallback(storage.local.get.bind(storage.local)),
        set: this.promisifyCallback(storage.local.set.bind(storage.local)),
        remove: this.promisifyCallback(storage.local.remove.bind(storage.local)),
        clear: this.promisifyCallback(storage.local.clear.bind(storage.local))
      },
      sync: {
        get: this.promisifyCallback(storage.sync.get.bind(storage.sync)),
        set: this.promisifyCallback(storage.sync.set.bind(storage.sync)),
        remove: this.promisifyCallback(storage.sync.remove.bind(storage.sync)),
        clear: this.promisifyCallback(storage.sync.clear.bind(storage.sync))
      }
    };
  }

  /**
   * Wrap Chrome tabs API
   * @private
   */
  wrapTabsAPI(tabs) {
    return {
      ...tabs,
      query: this.promisifyCallback(tabs.query.bind(tabs)),
      create: this.promisifyCallback(tabs.create.bind(tabs)),
      update: this.promisifyCallback(tabs.update.bind(tabs)),
      sendMessage: this.promisifyCallback(tabs.sendMessage.bind(tabs)),
      captureVisibleTab: this.promisifyCallback(tabs.captureVisibleTab.bind(tabs)),
      onUpdated: tabs.onUpdated,
      onActivated: tabs.onActivated
    };
  }

  /**
   * Wrap Chrome contextMenus API
   * @private
   */
  wrapContextMenusAPI(contextMenus) {
    return {
      ...contextMenus,
      create: this.promisifyCallback(contextMenus.create.bind(contextMenus)),
      update: this.promisifyCallback(contextMenus.update.bind(contextMenus)),
      remove: this.promisifyCallback(contextMenus.remove.bind(contextMenus)),
      removeAll: this.promisifyCallback(contextMenus.removeAll.bind(contextMenus)),
      onClicked: contextMenus.onClicked
    };
  }

  /**
   * Wrap Chrome notifications API
   * @private
   */
  wrapNotificationsAPI(notifications) {
    return {
      ...notifications,
      create: this.promisifyCallback(notifications.create.bind(notifications)),
      clear: this.promisifyCallback(notifications.clear.bind(notifications)),
      getAll: this.promisifyCallback(notifications.getAll.bind(notifications)),
      onClicked: notifications.onClicked,
      onButtonClicked: notifications.onButtonClicked
    };
  }

  /**
   * Wrap Chrome offscreen API
   * @private
   */
  wrapOffscreenAPI(offscreen) {
    return {
      ...offscreen,
      createDocument: this.promisifyCallback(offscreen.createDocument.bind(offscreen)),
      closeDocument: this.promisifyCallback(offscreen.closeDocument.bind(offscreen)),
      hasDocument: this.promisifyCallback(offscreen.hasDocument.bind(offscreen))
    };
  }

  /**
   * Wrap Chrome TTS API
   * @private
   */
  wrapTTSAPI(tts) {
    return {
      ...tts,
      speak: this.promisifyCallback(tts.speak.bind(tts)),
      stop: tts.stop.bind(tts),
      pause: tts.pause.bind(tts),
      resume: tts.resume.bind(tts),
      getVoices: this.promisifyCallback(tts.getVoices.bind(tts))
    };
  }

  /**
   * Convert callback-based Chrome API to promise-based
   * @private
   */
  promisifyCallback(fn) {
    return (...args) => {
      return new Promise((resolve, reject) => {
        fn(...args, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    };
  }

  /**
   * Make API globally available for backward compatibility
   * @private
   */
  makeGloballyAvailable() {
    if (typeof globalThis !== 'undefined') {
      globalThis.Browser = this.api;
      globalThis.browser = this.api;
      
      // For service worker context
      if (typeof self !== 'undefined') {
        self.Browser = this.api;
        self.browser = this.api;
      }
    }
  }

  /**
   * Get the unified API instance
   * @returns {Object} Browser API object
   */
  getAPI() {
    if (!this.initialized) {
      throw new Error('Unified browser API not initialized. Call initialize() first.');
    }
    return this.api;
  }

  /**
   * Check if API is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get initialization status and debug info
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      initialized: this.initialized,
      hasAPI: !!this.api,
      browser: environment.getBrowser(),
      apiType: this.api === browser ? 'native' : 
               this.api && this.api.runtime ? 'polyfill' : 'wrapped',
      availableAPIs: this.api ? Object.keys(this.api) : []
    };
  }
}

// Export singleton instance
export const unifiedAPI = new UnifiedBrowserAPI();

// Export Browser for backward compatibility (async)
let browserAPIPromise = null;

export async function getBrowserAPI() {
  if (browserAPIPromise) {
    return browserAPIPromise;
  }

  browserAPIPromise = (async () => {
    await unifiedAPI.initialize();
    return unifiedAPI.getAPI();
  })();

  return browserAPIPromise;
}

