// src/managers/capture-offscreen.js
// Chrome offscreen document screen capture manager

import browser from "webextension-polyfill";
import { MessageFormat, MessagingContexts, MessageActions } from "../../../messaging/core/MessagingCore.js";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'CaptureOffscreen');

/**
 * Offscreen Screen Capture Manager for Chrome
 * Uses Chrome's offscreen documents API for advanced screen capture
 */
export class OffscreenCaptureManager {
  constructor() {
    this.browser = null;
    this.offscreenCreated = false;
    this.initialized = false;
  }

  /**
   * Initialize the offscreen capture manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = browser;

      if (!browser.offscreen) {
        throw new Error("Offscreen API not available");
      }

      logger.debug("📸 Initializing Chrome offscreen capture manager");

      // Create offscreen document for advanced capture functionality
      await this.createOffscreenDocument();

      this.initialized = true;
      logger.debug("✅ Offscreen capture manager initialized");
    } catch (error) {
      logger.error(
        "❌ Failed to initialize offscreen capture manager:",
        error,
      );
      throw error;
    }
  }

  /**
   * Create offscreen document for screen capture
   * @private
   */
  async createOffscreenDocument() {
    try {
      // Check if offscreen document already exists
      const existingContexts = await browser.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
      });

      if (existingContexts.length > 0) {
        logger.debug("📄 Offscreen document already exists for capture");
        this.offscreenCreated = true;
        return;
      }

      // Create new offscreen document for screen capture
      await browser.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["DOM_SCRAPING", "BLOBS"],
        justification:
          "Screen capture processing and OCR for translation extension",
      });

      this.offscreenCreated = true;
      logger.debug("📄 Offscreen document created for screen capture");
    } catch (error) {
      logger.error(
        "❌ Failed to create offscreen document for capture:",
        error,
      );
      throw error;
    }
  }

  /**
   * Capture visible tab
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

      logger.debug("📸 Capturing visible tab with offscreen processing");

      // Capture visible tab
      const imageData = await browser.tabs.captureVisibleTab(captureOptions);

      // Process in offscreen document if needed
      if (options.processInOffscreen) {
        const message = MessageFormat.create(
          MessageActions.PROCESS_CAPTURE,
          { imageData, options },
          MessagingContexts.CAPTURE_MANAGER
        );
        
        const response = await browser.runtime.sendMessage(message);

        if (!response || !response.success) {
          throw new Error(
            response?.error ||
              "Failed to process capture in offscreen document",
          );
        }

        return response.processedData;
      }

      return imageData;
    } catch (error) {
      logger.error("❌ Screen capture failed:", error);
      throw new Error(`Screen capture failed: ${error.message}`);
    }
  }

  /**
   * Capture specific area of the screen
   * @param {Object} area - Area coordinates {x, y, width, height}
   * @param {Object} options - Capture options
   * @returns {Promise<string>} Base64 image data of cropped area
   */
  async captureArea(area, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // First capture the full visible tab
      const fullImage = await this.captureVisibleTab(options);

      // Process cropping in offscreen document
      const message = MessageFormat.create(
        MessageActions.CROP_IMAGE,
        { imageData: fullImage, area: area, options },
        MessagingContexts.CAPTURE_MANAGER
      );
      
      const response = await browser.runtime.sendMessage(message);

      if (!response || !response.success) {
        throw new Error(
          response?.error || "Failed to crop image in offscreen document",
        );
      }

      logger.debug("📸 Screen area captured and cropped");
      return response.croppedData;
    } catch (error) {
      logger.error("❌ Screen area capture failed:", error);
      throw new Error(`Screen area capture failed: ${error.message}`);
    }
  }

  /**
   * Process image for OCR
   * @param {string} imageData - Base64 image data
   * @param {Object} options - OCR options
   * @returns {Promise<string>} Extracted text
   */
  async processImageForOCR(imageData, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      logger.debug("🔍 Processing image for OCR in offscreen document");

      const message = MessageFormat.create(
        MessageActions.PROCESS_IMAGE_OCR,
        { 
          imageData,
          language: options.language || "eng",
          psm: options.psm || 6,
          ...options
        },
        MessagingContexts.CAPTURE_MANAGER
      );
      
      const response = await browser.runtime.sendMessage(message);

      if (!response || !response.success) {
        throw new Error(response?.error || "OCR processing failed");
      }

      logger.debug("✅ OCR processing completed");
      return response.extractedText;
    } catch (error) {
      logger.error("❌ OCR processing failed:", error);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  /**
   * Check if capture manager is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.initialized && this.offscreenCreated;
  }

  /**
   * Get debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      type: "offscreen-capture",
      initialized: this.initialized,
      offscreenCreated: this.offscreenCreated,
      hasOffscreenAPI: !!this.browser?.offscreen,
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.debug("🧹 Cleaning up offscreen capture manager");

    try {
      // Close offscreen document if we created it
      if (this.offscreenCreated && this.browser?.offscreen?.closeDocument) {
        await browser.offscreen.closeDocument();
        this.offscreenCreated = false;
      }
    } catch (error) {
      logger.error("❌ Error during capture manager cleanup:", error);
    }

    this.initialized = false;
  }
}