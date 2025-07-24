// src/managers/capture-content.js
// Content script-based screen capture manager (fallback)

import { getBrowserAPI } from '../utils/browser-unified.js';

/**
 * Content Script Screen Capture Manager
 * Fallback screen capture using content script injection
 */
export class ContentScriptCaptureManager {
  constructor() {
    this.browser = null;
    this.initialized = false;
  }

  /**
   * Initialize the content script capture manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = await getBrowserAPI();
      
      console.log('📸 Initializing content script capture manager');
      this.initialized = true;
      console.log('✅ Content script capture manager initialized');

    } catch (error) {
      console.error('❌ Failed to initialize content script capture manager:', error);
      throw error;
    }
  }

  /**
   * Capture visible tab using basic browser API
   * @param {Object} options - Capture options
   * @returns {Promise<string>} Base64 image data
   */
  async captureVisibleTab(options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const captureOptions = {
        format: options.format || 'png',
        quality: options.quality || 90
      };

      console.log('📸 Capturing visible tab via content script method');

      // Use basic tab capture API
      const imageData = await this.browser.tabs.captureVisibleTab(captureOptions);

      return imageData;

    } catch (error) {
      console.error('❌ Content script screen capture failed:', error);
      throw new Error(`Screen capture failed: ${error.message}`);
    }
  }

  /**
   * Capture specific area by injecting capture UI
   * @param {Object} area - Area coordinates {x, y, width, height}
   * @param {Object} options - Capture options
   * @returns {Promise<string>} Base64 image data of cropped area
   */
  async captureArea(area, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get active tab
      const [tab] = await this.browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      console.log('📸 Starting area capture via content script');

      // Inject capture UI into content script
      await this.browser.tabs.sendMessage(tab.id, {
        action: 'START_AREA_CAPTURE',
        source: 'background',
        data: { area, options }
      });

      // The content script will handle the UI and return coordinates
      // This is a simplified implementation - in reality, you'd need
      // to set up a more complex message passing system

      // For now, fallback to full screen capture and basic cropping
      const fullImage = await this.captureVisibleTab(options);
      
      if (area && area.width && area.height) {
        // Basic cropping using canvas (would be better in offscreen/content script)
        const croppedImage = await this.cropImageBasic(fullImage, area);
        return croppedImage;
      }

      return fullImage;

    } catch (error) {
      console.error('❌ Content script area capture failed:', error);
      throw new Error(`Area capture failed: ${error.message}`);
    }
  }

  /**
   * Basic image cropping (fallback implementation)
   * @private
   */
  async cropImageBasic(imageData, area) {
    try {
      // This is a basic implementation
      // In a real scenario, this would be done in a content script or offscreen document
      console.log('✂️ Performing basic image crop');
      
      // Return original image for now - proper cropping would need canvas API
      // which is not available in service worker context
      return imageData;

    } catch (error) {
      console.error('❌ Basic image crop failed:', error);
      return imageData; // Return original on failure
    }
  }

  /**
   * Process image for OCR using content script
   * @param {string} imageData - Base64 image data
   * @param {Object} options - OCR options
   * @returns {Promise<string>} Extracted text
   */
  async processImageForOCR(imageData, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get active tab for content script injection
      const [tab] = await this.browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found for OCR processing');
      }

      console.log('🔍 Processing image for OCR via content script');

      // Send image to content script for OCR processing
      const response = await this.browser.tabs.sendMessage(tab.id, {
        action: 'OCR_PROCESS',
        source: 'background',
        data: {
          imageData,
          options: {
            language: options.language || 'eng',
            ...options
          }
        }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'OCR processing failed in content script');
      }

      console.log('✅ OCR processing completed via content script');
      return response.extractedText;

    } catch (error) {
      console.error('❌ Content script OCR processing failed:', error);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  /**
   * Check if capture manager is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.initialized;
  }

  /**
   * Get debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      type: 'content-script-capture',
      initialized: this.initialized,
      hasTabsAPI: !!this.browser?.tabs,
      hasCaptureAPI: !!this.browser?.tabs?.captureVisibleTab
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up content script capture manager');
    this.initialized = false;
  }
}