// src/utils/feature-detection.js
// Runtime feature detection for cross-browser compatibility

/**
 * Runtime feature detection class
 * Detects available APIs and capabilities at runtime
 */
export class FeatureDetector {
  constructor() {
    this.cache = new Map();
    this.detectionPromises = new Map();
  }

  /**
   * Comprehensive capability check
   * @returns {Promise<Object>} Object containing all detected capabilities
   */
  async checkAllCapabilities() {
    const capabilities = {
      // Core extension APIs
      runtime: await this.checkRuntimeAPI(),
      storage: await this.checkStorageAPI(),
      tabs: await this.checkTabsAPI(),
      
      // Advanced APIs
      offscreen: await this.checkOffscreenAPI(),
      sidePanel: await this.checkSidePanelAPI(),
      tts: await this.checkTTSAPI(),
      
      // Audio/Media APIs
      webAudio: await this.checkWebAudioAPI(),
      speechSynthesis: await this.checkSpeechSynthesisAPI(),
      
      // Background script type
      serviceWorker: await this.checkServiceWorkerContext(),
      persistentBackground: await this.checkPersistentBackgroundContext(),
      
      // Browser detection
      browser: this.detectBrowser(),
      
      // Context detection
      context: this.detectContext()
    };

    return capabilities;
  }

  /**
   * Check if chrome.runtime API is available
   */
  async checkRuntimeAPI() {
    return this.cachedCheck('runtime', () => {
      try {
        return typeof chrome !== 'undefined' && 
               typeof chrome.runtime !== 'undefined' ||
               typeof browser !== 'undefined' && 
               typeof browser.runtime !== 'undefined';
      } catch {
        return false;
      }
    });
  }

  /**
   * Check if storage API is available
   */
  async checkStorageAPI() {
    return this.cachedCheck('storage', () => {
      try {
        return typeof chrome !== 'undefined' && 
               typeof chrome.storage !== 'undefined' ||
               typeof browser !== 'undefined' && 
               typeof browser.storage !== 'undefined';
      } catch {
        return false;
      }
    });
  }

  /**
   * Check if tabs API is available
   */
  async checkTabsAPI() {
    return this.cachedCheck('tabs', () => {
      try {
        return typeof chrome !== 'undefined' && 
               typeof chrome.tabs !== 'undefined' ||
               typeof browser !== 'undefined' && 
               typeof browser.tabs !== 'undefined';
      } catch {
        return false;
      }
    });
  }

  /**
   * Check if chrome.offscreen API is available
   */
  async checkOffscreenAPI() {
    return this.cachedCheck('offscreen', () => {
      try {
        // Offscreen API is only available in background/service worker context
        const context = this.detectContext();
        if (context !== 'service-worker' && context !== 'extension-page') {
          return false;
        }
        return typeof chrome !== 'undefined' && 
               typeof chrome.offscreen !== 'undefined' &&
               typeof chrome.offscreen.createDocument === 'function';
      } catch {
        return false;
      }
    });
  }

  /**
   * Check if chrome.sidePanel API is available
   */
  async checkSidePanelAPI() {
    return this.cachedCheck('sidePanel', () => {
      try {
        // SidePanel API is only available in background/service worker context
        const context = this.detectContext();
        if (context !== 'service-worker' && context !== 'extension-page') {
          return false;
        }
        return typeof chrome !== 'undefined' && 
               typeof chrome.sidePanel !== 'undefined';
      } catch {
        return false;
      }
    });
  }

  /**
   * Check if chrome.tts API is available
   */
  async checkTTSAPI() {
    return this.cachedCheck('tts', () => {
      try {
        // TTS API is only available in background/service worker context
        const context = this.detectContext();
        if (context !== 'service-worker' && context !== 'extension-page') {
          return false;
        }
        return typeof chrome !== 'undefined' && 
               typeof chrome.tts !== 'undefined' &&
               typeof chrome.tts.speak === 'function';
      } catch {
        return false;
      }
    });
  }

  /**
   * Check if Web Audio API is available
   */
  async checkWebAudioAPI() {
    return this.cachedCheck('webAudio', () => {
      try {
        return typeof window !== 'undefined' && 
               (typeof window.AudioContext !== 'undefined' || 
                typeof window.webkitAudioContext !== 'undefined');
      } catch {
        return false;
      }
    });
  }

  /**
   * Check if Speech Synthesis API is available
   */
  async checkSpeechSynthesisAPI() {
    return this.cachedCheck('speechSynthesis', () => {
      try {
        return typeof window !== 'undefined' && 
               typeof window.speechSynthesis !== 'undefined' &&
               typeof window.SpeechSynthesisUtterance !== 'undefined';
      } catch {
        return false;
      }
    });
  }

  /**
   * Check if running in service worker context
   */
  async checkServiceWorkerContext() {
    return this.cachedCheck('serviceWorker', () => {
      return typeof importScripts === 'function' && 
             typeof window === 'undefined';
    });
  }

  /**
   * Check if running in persistent background context
   */
  async checkPersistentBackgroundContext() {
    return this.cachedCheck('persistentBackground', () => {
      return typeof window !== 'undefined' && 
             window.location && 
             (window.location.protocol === 'chrome-extension:' ||
              window.location.protocol === 'moz-extension:');
    });
  }

  /**
   * Detect current browser
   */
  detectBrowser() {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getBrowserInfo) {
      return 'firefox';
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
      return 'chrome';
    }
    return 'unknown';
  }

  /**
   * Detect execution context
   */
  detectContext() {
    if (typeof importScripts === 'function') {
      return 'service-worker';
    }
    if (typeof window !== 'undefined') {
      if (window.location?.protocol === 'chrome-extension:' || 
          window.location?.protocol === 'moz-extension:') {
        return 'extension-page';
      }
      return 'content-script';
    }
    return 'unknown';
  }

  /**
   * Test if a specific API works by calling it
   * @param {string} apiName - Name of the API to test
   * @param {Function} testFunction - Function to test the API
   * @returns {Promise<boolean>} Whether the API works
   */
  async testAPI(apiName, testFunction) {
    const cacheKey = `test_${apiName}`;
    
    if (!this.detectionPromises.has(cacheKey)) {
      this.detectionPromises.set(cacheKey, this.performAPITest(testFunction));
    }
    
    return this.detectionPromises.get(cacheKey);
  }

  /**
   * Perform actual API test
   * @private
   */
  async performAPITest(testFunction) {
    try {
      const result = await Promise.race([
        testFunction(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      ]);
      return !!result;
    } catch (error) {
      console.debug('API test failed:', error.message);
      return false;
    }
  }

  /**
   * Cached feature check to avoid repeated detection
   * @private
   */
  cachedCheck(feature, checkFunction) {
    if (this.cache.has(feature)) {
      return this.cache.get(feature);
    }
    
    const result = checkFunction();
    this.cache.set(feature, result);
    return result;
  }

  /**
   * Clear detection cache
   */
  clearCache() {
    this.cache.clear();
    this.detectionPromises.clear();
  }

  /**
   * Get cached results without re-detection
   * @returns {Object} Cached detection results
   */
  getCachedResults() {
    return Object.fromEntries(this.cache.entries());
  }
}

// Export singleton instance
export const featureDetector = new FeatureDetector();