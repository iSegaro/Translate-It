// src/managers/capture-content.js
// Content script-based screen capture manager (fallback)

import browser from "webextension-polyfill";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'capture-content');

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
      this.browser = browser;

      logger.debug("📸 Initializing content script capture manager");
      this.initialized = true;
      logger.debug("✅ Content script capture manager initialized");
    } catch (error) {
      logger.error(
        "❌ Failed to initialize content script capture manager:",
        error,
      );
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
        format: options.format || "png",
        quality: options.quality || 90,
      };

      logger.debug("📸 Capturing visible tab via content script method");

      // Use basic tab capture API
      const imageData = await browser.tabs.captureVisibleTab(captureOptions);

      return imageData;
    } catch (error) {
      logger.error("❌ Content script screen capture failed:", error);
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
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) {
        throw new Error("No active tab found");
      }

      logger.debug("📸 Starting area capture via content script");

      // Inject capture UI into content script
      await browser.tabs.sendMessage(tab.id, {
        action: "START_AREA_CAPTURE",
        source: "background",
        data: { area, options },
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
      logger.error("❌ Content script area capture failed:", error);
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
      logger.debug("✂️ Performing basic image crop");

      // Return original image for now - proper cropping would need canvas API
      // which is not available in service worker context
      return imageData;
    } catch (error) {
      logger.error("❌ Basic image crop failed:", error);
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
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) {
        throw new Error("No active tab found for OCR processing");
      }

      logger.debug("🔍 Processing image for OCR via content script");

      // Send image to content script for OCR processing
      const response = await browser.tabs.sendMessage(tab.id, {
        action: "OCR_PROCESS",
        source: "background",
        data: {
          imageData,
          options: {
            language: options.language || "eng",
            ...options,
          },
        },
      });

      if (!response || !response.success) {
        throw new Error(
          response?.error || "OCR processing failed in content script",
        );
      }

      logger.debug("✅ OCR processing completed via content script");
      return response.extractedText;
    } catch (error) {
      logger.error("❌ Content script OCR processing failed:", error);
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
      type: "content-script-capture",
      initialized: this.initialized,
      hasTabsAPI: !!this.browser?.tabs,
      hasCaptureAPI: !!this.browser?.tabs?.captureVisibleTab,
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.debug("🧹 Cleaning up content script capture manager");
    this.initialized = false;
  }
}