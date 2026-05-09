// src/capture/CaptureManager.js

import browser from "webextension-polyfill";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.SCREEN_CAPTURE, 'CaptureManager');

import { handleUIError } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ProviderRegistry } from "@/core/provider-registry.js";
import { TranslationMode } from "@/shared/config/config.js";
import { textExtractor } from "./TextExtractor.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import ExtensionContextManager from '@/core/extensionContext.js';



/**
 * Central manager for screen capture translation functionality
 * Orchestrates the entire capture, preview, translate, and display workflow
 */
export class CaptureManager extends ResourceTracker {
  constructor() {
    super('capture-manager')
    this.isActive = false;
    this.currentCapture = null;
    this.screenSelector = null;
    // Note: capturePreview and captureResult are now managed in content script
  }

  /**
   * Initialize screen capture for area selection
   * @param {Object} options - Capture options
   * @param {string} options.sourceLanguage - Source language
   * @param {string} options.targetLanguage - Target language
   * @param {string} options.provider - Translation provider ID
   * @returns {Promise<void>}
   */
  async startAreaCapture(options) {
    try {
  logger.debug('Starting area capture', options);

      // Validate provider supports image translation
      if (!this._validateProviderSupport(options.provider)) {
        throw this._createError(
          ErrorTypes.PROVIDER_IMAGE_NOT_SUPPORTED,
          "Provider does not support image translation",
        );
      }

      // Check if already active
      if (this.isActive) {
        this.cleanup();
      }

      this.isActive = true;

      // Store options for later use
      this.captureOptions = options;

      // Start area selection in content script via messaging
      const tabId = options.tabId;
      if (tabId) {
        await browser.tabs.sendMessage(tabId, {
          action: MessageActions.START_SCREEN_CAPTURE,
          source: "background",
          data: options
        });
      } else {
        throw new Error("No active tab for area capture");
      }

      logger.init('Area capture request sent to content script');
    } catch (error) {
  logger.error('Error starting area capture:', error);
      this.cleanup();
      throw this._normalizeError(error, "startAreaCapture");
    }
  }

  /**
   * Initialize full screen capture
   * @param {Object} options - Capture options
   * @returns {Promise<void>}
   */
  async startFullScreenCapture(options) {
    try {
  logger.debug('Starting full screen capture', options);

      // Validate provider supports image translation
      if (!this._validateProviderSupport(options.provider)) {
        throw this._createError(
          ErrorTypes.PROVIDER_IMAGE_NOT_SUPPORTED,
          "Provider does not support image translation",
        );
      }

      // Check if already active
      if (this.isActive) {
        this.cleanup();
      }

      this.isActive = true;
      this.captureOptions = options;

      // Capture full screen directly
      const captureData = await this._captureScreen();

      // Show preview for confirmation
      await this._showPreview(captureData, "fullscreen");

  logger.info('Full screen capture completed');
    } catch (error) {
  logger.error('Error in full screen capture:', error);
      this.cleanup();
      throw this._normalizeError(error, "startFullScreenCapture");
    }
  }

  /**
   * Process area capture image from content script (after cropping)
   * @param {Object} captureData - Cropped capture data from content script
   * @param {Object} captureOptions - Original capture options
   * @returns {Promise<void>}
   */
  async processAreaCaptureImage(captureData, captureOptions) {
    try {
  logger.debug('Processing area capture image from content script');

      // Store options
      this.captureOptions = captureOptions;
      this.isActive = true;

      // Show preview for confirmation (image already cropped by content script)
      await this._showPreview(captureData, "area", captureData.dimensions);
    } catch (error) {
  logger.error('Error processing area capture image:', error);
      this.cleanup();
      throw this._normalizeError(error, "processAreaCaptureImage");
    }
  }

  /**
   * Handle area selection completion (legacy method - no longer used)
   * Image cropping now handled in content script
   * @param {Object} selectionData - Selected area data
   * @private
   * @deprecated Use processAreaCaptureImage instead
   */
  async _handleAreaSelection() {
  logger.debug('Legacy area selection handler called - this should not happen');
  logger.debug('Image cropping should be handled in content script now');
    throw this._createError(
      ErrorTypes.INTEGRATION,
      "Legacy area selection method called - use content script cropping instead",
    );
  }

  /**
   * Handle capture cancellation
   * @private
   */
  _handleCaptureCancel() {
  logger.debug('Capture cancelled by user');
    this.cleanup();
  }

  /**
   * Show capture preview in content script
   * @param {Object} captureData - Captured image data
   * @param {string} captureType - Type of capture (area/fullscreen)
   * @param {Object} [selectionData] - Selection data for area captures
   * @private
   */
  async _showPreview(captureData, captureType, selectionData = null) {
    try {
  logger.debug('Requesting preview display in content script');

      // Get active tab to send preview message
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!activeTab) {
        throw this._createError(
          ErrorTypes.TAB_AVAILABILITY,
          "No active tab found for preview display",
        );
      }

      // Send preview data to content script
      try {
        await browser.tabs.sendMessage(activeTab.id, {
          action: MessageActions.SCREEN_CAPTURE_OCR_RESULT,
          data: {
            captureData,
            captureType,
            selectionData,
            translationOptions: this.captureOptions,
          },
        });
      } catch (sendError) {
        // Use centralized context error detection
        if (ExtensionContextManager.isContextError(sendError)) {
          ExtensionContextManager.handleContextError(sendError, 'capture-manager');
        } else {
          logger.warn(`Could not send preview to tab ${activeTab.id}:`, sendError);
        }
        throw this._createError(
          ErrorTypes.TAB_AVAILABILITY,
          "Content script not available on this tab",
        );
      }

  logger.debug('Preview request sent to content script');
    } catch (error) {
  logger.error('Error requesting preview display:', error);
      throw this._normalizeError(error, "showPreview");
    }
  }

  /**
   * Handle preview confirmation from content script - start translation
   * @param {Object} captureData - Confirmed capture data
   */
  async handlePreviewConfirm(captureData) {
    try {
  logger.debug('Preview confirmed, starting translation');

      // Store current capture data
      this.currentCapture = captureData;

      // Start translation process
      await this._translateCapturedImage(captureData);
    } catch (error) {
  logger.error('Error in preview confirmation:', error);
      handleUIError(this._normalizeError(error, "handlePreviewConfirm"));
    }
  }

  /**
   * Handle preview cancellation from content script
   */
  handlePreviewCancel() {
  logger.debug('Preview cancelled');
    this.cleanup();
  }

  /**
   * Handle preview retry from content script - restart capture process
   * @param {string} captureType - Type of capture to retry
   */
  async handlePreviewRetry(captureType) {
    try {
  logger.debug('Retrying capture', { captureType });

      // Restart based on capture type
      if (captureType === "area") {
        // For area capture, restart the area selection process
  logger.debug('Restarting area capture selection');

        // Get active tab to send area selection restart message
        const [activeTab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });

        if (!activeTab) {
          throw this._createError(
            ErrorTypes.TAB_AVAILABILITY,
            "No active tab found for area capture retry",
          );
        }

        // Send area selection start message to content script
        try {
          await browser.tabs.sendMessage(activeTab.id, {
            action: MessageActions.START_SCREEN_AREA_SELECTION,
            data: this.captureOptions,
          });
        } catch (sendError) {
          // Use centralized context error detection
          if (ExtensionContextManager.isContextError(sendError)) {
            ExtensionContextManager.handleContextError(sendError, 'capture-manager');
          } else {
            logger.warn(`Could not send area selection to tab ${activeTab.id}:`, sendError);
          }
          throw this._createError(
            ErrorTypes.TAB_AVAILABILITY,
            "Content script not available on this tab",
          );
        }

  logger.init('Area capture retry initiated successfully');
      } else {
        // For fullscreen, wait for preview to close then capture again
  logger.debug('Restarting fullscreen capture');

        // Add delay to ensure preview window is fully closed and DOM updated
        await new Promise((resolve) => setTimeout(resolve, 500));

        const captureData = await this._captureScreen();
        await this._showPreview(captureData, "fullscreen");

  logger.info('Fullscreen capture retry completed');
      }
    } catch (error) {
  logger.error('Error retrying capture:', error);
      handleUIError(this._normalizeError(error, "handlePreviewRetry"));
    }
  }

  /**
   * Translate captured image using TextExtractor (AI or OCR)
   * @param {Object} captureData - Image data to translate
   * @private
   */
  async _translateCapturedImage(captureData) {
    try {
  logger.debug('Starting image translation');

      const { provider, sourceLanguage, targetLanguage } = this.captureOptions;

      // Use TextExtractor for unified text extraction and translation
      const extractionResult = await textExtractor.extractAndTranslate(
        captureData.imageData,
        {
          method: "ai", // Currently only AI method is available
          provider,
          sourceLang: sourceLanguage,
          targetLang: targetLanguage,
          mode: TranslationMode.ScreenCapture,
        },
      );

  logger.info('Translation completed:', {
        method: extractionResult.method,
        success: !!extractionResult.translatedText,
        textLength: extractionResult.translatedText?.length || 0,
      });

      // Note: Result display is now handled via SCREEN_CAPTURE_OCR_RESULT message
      // This method completes translation, result is routed by the caller
    } catch (error) {
  logger.error('Error translating image:', error);
      throw this._normalizeError(error, "translateCapturedImage");
    }
  }

  /**
   * Handle translation result close from content script (legacy - no longer used)
   */
  handleResultClose() {
  logger.info('Translation result closed');
    this.cleanup();
  }

  /**
   * Capture screen using browser API
   * @returns {Promise<Object>} Capture data
   * @private
   */
  async _captureScreen() {
    try {
  logger.debug('Capturing screen');

      // Get active tab
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!activeTab) {
        throw this._createError(
          ErrorTypes.TAB_AVAILABILITY,
          "No active tab found",
        );
      }

      // Capture visible tab
      const dataUrl = await browser.tabs.captureVisibleTab(
        activeTab.windowId,
        {
          format: "png",
          quality: 100,
        },
      );

      return {
        imageData: dataUrl,
        timestamp: Date.now(),
        tabId: activeTab.id,
        url: activeTab.url,
        position: { x: 0, y: 0 },
      };
    } catch (error) {
  logger.error('Error capturing screen:', error);

      if (error.message?.includes("permission")) {
        throw this._createError(
          ErrorTypes.SCREEN_CAPTURE_PERMISSION_DENIED,
          "Screen capture permission denied",
        );
      }

      throw this._createError(
        ErrorTypes.SCREEN_CAPTURE_FAILED,
        `Screen capture failed: ${error.message}`,
      );
    }
  }

  // Note: _captureScreenArea method removed - image cropping now handled in content script

  /**
   * Validate if provider supports image translation
   * @param {string} providerId - Provider ID
   * @returns {boolean} True if supported
   * @private
   */
  _validateProviderSupport(providerId) {
    if (!providerId) return true; // Allow starting without a provider (uses default/local OCR)

    const provider = ProviderRegistry.getById(providerId);
    if (!provider) {
      return true; // Assume local OCR fallback is possible
    }

    // AI providers support direct image translation, 
    // but others can still work with local OCR fallback
    return true; 
  }

  /**
   * Create normalized error object
   * @param {string} type - Error type
   * @param {string} message - Error message
   * @returns {Error} Normalized error
   * @private
   */
  _createError(type, message) {
    const error = new Error(message);
    error.type = type;
    error.context = "screen-capture";
    return error;
  }

  /**
   * Normalize error for consistent handling
   * @param {Error} error - Original error
   * @param {string} context - Operation context
   * @returns {Error} Normalized error
   * @private
   */
  _normalizeError(error, context) {
    if (error.type) {
      // Already normalized
      return error;
    }

    // Normalize based on error characteristics
    let errorType = ErrorTypes.SCREEN_CAPTURE;

    if (error.message?.includes("permission")) {
      errorType = ErrorTypes.SCREEN_CAPTURE_PERMISSION_DENIED;
    } else if (error.message?.includes("not supported")) {
      errorType = ErrorTypes.SCREEN_CAPTURE_NOT_SUPPORTED;
    } else if (error.message?.includes("capture")) {
      errorType = ErrorTypes.SCREEN_CAPTURE_FAILED;
    } else if (
      error.message?.includes("image") ||
      error.message?.includes("canvas")
    ) {
      errorType = ErrorTypes.IMAGE_PROCESSING_FAILED;
    }

    const normalizedError = new Error(error.message || "Screen capture error");
    normalizedError.type = errorType;
    normalizedError.context = `screen-capture-${context}`;

    return normalizedError;
  }

  /**
   * Clean up all capture components and reset state
   */
  cleanup() {
    logger.debug('Cleaning up');

    this.isActive = false;
    this.currentCapture = null;
    this.captureOptions = null;

    // Cleanup screenSelector if exists
    if (this.screenSelector) {
      this.screenSelector.cleanup();
      this.screenSelector = null;
    }

    // Note: UI components (capturePreview, captureResult)
    // are now managed in content script, not background script
    this.capturePreview = null;
    this.captureResult = null;
    
    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();
    
    logger.debug('CaptureManager cleanup completed');
  }
}

// Export singleton instance
export const captureManager = new CaptureManager();
