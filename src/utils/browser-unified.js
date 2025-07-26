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
  }

  /**
   * Initialize the unified browser API
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await environment.initialize();
      
      const browserEnv = environment.getBrowser();
      const manifestVersion = environment.getManifestVersion();
      console.log(`🔗 Initializing unified API for ${browserEnv} (Manifest V${manifestVersion})`);

      if (manifestVersion === 3 && typeof chrome !== 'undefined') {
        // Chrome (Manifest V3) - use native chrome API and wrap it
        this.api = this.wrapChromeAPI(chrome);
        console.log('🌐 Using wrapped Chrome native API (Manifest V3)');
      } else if (typeof browser !== 'undefined') {
        // Firefox (Manifest V2/V3) - use native browser API or polyfill
        this.api = browser;
        console.log('🦊 Using Firefox native browser API or polyfill');
      } else {
        throw new Error(`Unsupported browser or API not available: ${browserEnv} (Manifest V${manifestVersion})`);
      }

      console.log('Debug: this.api after initialization:', this.api);
      if (this.api && this.api.storage) {
        console.log('Debug: this.api.storage is available.');
      } else {
        console.log('Debug: this.api.storage is NOT available.');
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
   * Wrap Chrome API to provide promise-based interface similar to webextension-polyfill
   * @private
   */
  wrapChromeAPI(chromeAPI) {
    const wrapped = {};

    // Wrap common APIs
    wrapped.runtime = this.wrapRuntimeAPI(chromeAPI.runtime);
    if (chromeAPI.storage) {
      wrapped.storage = this.wrapStorageAPI(chromeAPI.storage);
    }
    if (chromeAPI.tabs) {
      wrapped.tabs = this.wrapTabsAPI(chromeAPI.tabs);
    }
    if (chromeAPI.contextMenus) {
      wrapped.contextMenus = this.wrapContextMenusAPI(chromeAPI.contextMenus);
    }
    if (chromeAPI.notifications) {
      wrapped.notifications = this.wrapNotificationsAPI(chromeAPI.notifications);
    }
    
    // Add commands API wrapping
    if (chromeAPI.commands) {
      wrapped.commands = this.wrapCommandsAPI(chromeAPI.commands);
    }

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
    
    // Add i18n API wrapping
    if (chromeAPI.i18n) {
      wrapped.i18n = this.wrapI18nAPI(chromeAPI.i18n);
    }

    return wrapped;
  }

  /**
   * Wrap Chrome commands API
   * @private
   */
  wrapCommandsAPI(commands) {
    return {
      ...commands,
      getAll: this.promisifyCallback(commands.getAll.bind(commands)),
      onCommand: commands.onCommand // onCommand is an event, not a method to promisify
    };
  }

  /**
   * Wrap Chrome runtime API
   * @private
   */
  wrapRuntimeAPI(runtime) {
    return {
      ...runtime,
      sendMessage: this.promisifyRuntimeSendMessage(runtime.sendMessage.bind(runtime)),
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
      },
      // Add onChanged listener support
      onChanged: storage.onChanged ? {
        addListener: storage.onChanged.addListener.bind(storage.onChanged),
        removeListener: storage.onChanged.removeListener.bind(storage.onChanged),
        hasListener: storage.onChanged.hasListener ? storage.onChanged.hasListener.bind(storage.onChanged) : undefined
      } : undefined
    };
  }

  /**
   * Wrap Chrome tabs API
   * @private
   */
  wrapTabsAPI(tabs) {
    const wrappedTabs = {
      ...tabs,
      query: this.promisifyCallback(tabs.query.bind(tabs)),
      create: this.promisifyCallback(tabs.create.bind(tabs)),
      update: this.promisifyCallback(tabs.update.bind(tabs)),
      sendMessage: this.promisifyTabsSendMessage(tabs.sendMessage.bind(tabs)),
      onUpdated: tabs.onUpdated,
      onActivated: tabs.onActivated
    };

    // Conditionally wrap captureVisibleTab as it's not available in Firefox
    if (tabs.captureVisibleTab && typeof tabs.captureVisibleTab === 'function') {
      wrappedTabs.captureVisibleTab = this.promisifyCallback(tabs.captureVisibleTab.bind(tabs));
    }

    return wrappedTabs;
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
   * Wrap Chrome i18n API
   * @private
   */
  wrapI18nAPI(i18n) {
    return {
      ...i18n,
      getMessage: i18n.getMessage.bind(i18n),
      getAcceptLanguages: this.promisifyCallback(i18n.getAcceptLanguages.bind(i18n)),
      detectLanguage: this.promisifyCallback(i18n.detectLanguage.bind(i18n)),
      getUILanguage: i18n.getUILanguage.bind(i18n)
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
   * Special promisify for runtime.sendMessage which has specific signature
   * @private
   */
  promisifyRuntimeSendMessage(sendMessageFn) {
    return (message, options = {}) => {
      return new Promise((resolve, reject) => {
        // Handle different call signatures
        if (typeof options === 'function') {
          // If options is actually a callback, treat it as legacy usage
          const callback = options;
          sendMessageFn(message, callback);
          return;
        }

        // Normal promise-based usage
        const callback = (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        };

        // Call with proper signature: message, options (optional), callback
        if (options && Object.keys(options).length > 0) {
          sendMessageFn(message, options, callback);
        } else {
          sendMessageFn(message, callback);
        }
      });
    };
  }

  /**
   * Special promisify for tabs.sendMessage which has specific signature
   * @private
   */
  promisifyTabsSendMessage(sendMessageFn) {
    return (tabId, message, options = {}) => {
      return new Promise((resolve, reject) => {
        // Handle different call signatures
        if (typeof options === 'function') {
          // If options is actually a callback, treat it as legacy usage
          const callback = options;
          sendMessageFn(tabId, message, callback);
          return;
        }

        // Normal promise-based usage
        const callback = (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        };

        // Call with proper signature: tabId, message, options (optional), callback
        if (options && Object.keys(options).length > 0) {
          sendMessageFn(tabId, message, options, callback);
        } else {
          sendMessageFn(tabId, message, callback);
        }
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
