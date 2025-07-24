// src/utils/environment.js
// Environment detection and configuration

import { getBrowserCapabilities, getBrowserName } from './browser-capabilities.js';
import { featureDetector } from './feature-detection.js';

/**
 * Environment detection and management class
 */
export class Environment {
  constructor() {
    this.browserName = null;
    this.capabilities = null;
    this.detectedFeatures = null;
    this.initialized = false;
  }

  /**
   * Initialize environment detection
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Detect browser
      this.browserName = getBrowserName();
      console.log(`🌐 Detected browser: ${this.browserName}`);

      // Get static capabilities
      this.capabilities = getBrowserCapabilities();
      console.log('⚙️ Loaded browser capabilities:', this.capabilities);

      // Runtime feature detection
      this.detectedFeatures = await featureDetector.checkAllCapabilities();
      console.log('🔍 Detected features:', this.detectedFeatures);

      // Validate capabilities against runtime
      this.validateCapabilities();

      this.initialized = true;
      console.log('✅ Environment initialized successfully');

    } catch (error) {
      console.error('❌ Environment initialization failed:', error);
      throw error;
    }
  }

  /**
   * Validate static capabilities against runtime detection
   * @private
   */
  validateCapabilities() {
    // Check for mismatches between expected and actual capabilities
    const mismatches = [];

    if (this.capabilities.hasOffscreenAPI !== this.detectedFeatures.offscreen) {
      mismatches.push({
        feature: 'offscreen',
        expected: this.capabilities.hasOffscreenAPI,
        actual: this.detectedFeatures.offscreen
      });
    }

    if (this.capabilities.hasSidePanelAPI !== this.detectedFeatures.sidePanel) {
      mismatches.push({
        feature: 'sidePanel',
        expected: this.capabilities.hasSidePanelAPI,
        actual: this.detectedFeatures.sidePanel
      });
    }

    if (this.capabilities.hasTTSAPI !== this.detectedFeatures.tts) {
      mismatches.push({
        feature: 'tts',
        expected: this.capabilities.hasTTSAPI,
        actual: this.detectedFeatures.tts
      });
    }

    if (mismatches.length > 0) {
      console.warn('🚨 Capability mismatches detected:', mismatches);
      // Update capabilities based on runtime detection
      this.updateCapabilitiesFromRuntime();
    }
  }

  /**
   * Update capabilities based on runtime detection
   * @private
   */
  updateCapabilitiesFromRuntime() {
    this.capabilities.hasOffscreenAPI = this.detectedFeatures.offscreen;
    this.capabilities.hasSidePanelAPI = this.detectedFeatures.sidePanel;
    this.capabilities.hasTTSAPI = this.detectedFeatures.tts;
    
    console.log('🔄 Updated capabilities based on runtime detection');
  }

  /**
   * Get browser name
   * @returns {string}
   */
  getBrowser() {
    return this.browserName || 'unknown';
  }

  /**
   * Get browser capabilities
   * @returns {Object}
   */
  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Get detected features
   * @returns {Object}
   */
  getDetectedFeatures() {
    return this.detectedFeatures;
  }

  /**
   * Check if a feature is available
   * @param {string} feature - Feature name
   * @returns {boolean}
   */
  hasFeature(feature) {
    if (!this.initialized) {
      console.warn('Environment not initialized, feature check may be inaccurate');
    }

    // Use runtime detection if available, fall back to capabilities
    if (this.detectedFeatures && feature in this.detectedFeatures) {
      return this.detectedFeatures[feature];
    }

    if (this.capabilities) {
      switch (feature) {
        case 'offscreen':
          return this.capabilities.hasOffscreenAPI;
        case 'sidePanel':
          return this.capabilities.hasSidePanelAPI;
        case 'tts':
          return this.capabilities.hasTTSAPI;
        case 'serviceWorker':
          return this.capabilities.hasServiceWorker;
        case 'persistentBackground':
          return this.capabilities.hasPersistentBackground;
        default:
          return false;
      }
    }

    return false;
  }

  /**
   * Get the appropriate workaround for a feature
   * @param {string} feature - Feature name
   * @returns {string}
   */
  getWorkaround(feature) {
    if (!this.capabilities) {
      return 'not-supported';
    }

    return this.capabilities.workarounds[feature] || 'not-supported';
  }

  /**
   * Check if running in service worker context
   * @returns {boolean}
   */
  isServiceWorker() {
    return this.detectedFeatures?.context === 'service-worker';
  }

  /**
   * Check if running in persistent background context
   * @returns {boolean}
   */
  isPersistentBackground() {
    return this.detectedFeatures?.persistentBackground === true;
  }

  /**
   * Check if running in content script context
   * @returns {boolean}
   */
  isContentScript() {
    return this.detectedFeatures?.context === 'content-script';
  }

  /**
   * Check if running in extension page context
   * @returns {boolean}
   */
  isExtensionPage() {
    return this.detectedFeatures?.context === 'extension-page';
  }

  /**
   * Get the appropriate TTS method for current environment
   * @returns {string}
   */
  getTTSMethod() {
    if (!this.capabilities) {
      return 'not-supported';
    }

    return this.capabilities.ttsMethod;
  }

  /**
   * Get the appropriate audio method for current environment
   * @returns {string}
   */
  getAudioMethod() {
    if (!this.capabilities) {
      return 'not-supported';
    }

    return this.capabilities.audioMethod;
  }

  /**
   * Get panel system type
   * @returns {string}
   */
  getPanelSystem() {
    if (!this.capabilities) {
      return 'unknown';
    }

    return this.capabilities.panelSystem;
  }

  /**
   * Get browser-specific permissions
   * @returns {Array<string>}
   */
  getSpecificPermissions() {
    if (!this.capabilities) {
      return [];
    }

    return this.capabilities.specificPermissions || [];
  }

  /**
   * Get manifest version
   * @returns {number}
   */
  getManifestVersion() {
    if (!this.capabilities) {
      return 3; // Default to MV3
    }

    return this.capabilities.manifestVersion;
  }

  /**
   * Get manifest configuration
   * @returns {Object}
   */
  getManifestConfig() {
    if (!this.capabilities) {
      return {};
    }

    return this.capabilities.manifest || {};
  }

  /**
   * Debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      initialized: this.initialized,
      browser: this.browserName,
      capabilities: this.capabilities,
      detectedFeatures: this.detectedFeatures,
      context: this.detectedFeatures?.context,
      isServiceWorker: this.isServiceWorker(),
      isPersistentBackground: this.isPersistentBackground()
    };
  }
}

// Export singleton instance
export const environment = new Environment();

// Legacy exports for backward compatibility
export const isFirefox = () => environment.getBrowser() === 'firefox';
export const isChrome = () => environment.getBrowser() === 'chrome';
export const isServiceWorker = () => environment.isServiceWorker();
export const isPersistentBackground = () => environment.isPersistentBackground();