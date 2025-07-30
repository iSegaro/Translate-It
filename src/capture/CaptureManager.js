// src/capture/CaptureManager.js

import { getbrowser } from "@/utils/browser-polyfill.js";
import { logME } from "../utils/helpers.js";
import { handleUIError } from "../error-management/ErrorService.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { ProviderRegistry } from "../core/provider-registry.js";
import { TranslationMode } from "../config.js";
import { ScreenSelector } from "./ScreenSelector.js";
import { textExtractor } from "./TextExtractor.js";

/**
 * Central manager for screen capture translation functionality
 * Orchestrates the entire capture, preview, translate, and display workflow
 */
export class CaptureManager {
  constructor() {
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
      logME("[CaptureManager] Starting area capture", options);

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

      // Initialize screen selector for area selection
      this.screenSelector = new ScreenSelector({
        mode: "area",
        onSelectionComplete: this._handleAreaSelection.bind(this),
        onCancel: this._handleCaptureCancel.bind(this),
      });

      // Store options for later use
      this.captureOptions = options;

      // Start area selection
      await this.screenSelector.start();

      logME("[CaptureManager] Area capture initialized successfully");
    } catch (error) {
      logME("[CaptureManager] Error starting area capture:", error);
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
      logME("[CaptureManager] Starting full screen capture", options);

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

      logME("[CaptureManager] Full screen capture completed");
    } catch (error) {
      logME("[CaptureManager] Error in full screen capture:", error);
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
      logME(
        "[CaptureManager] Processing area capture image from content script",
      );

      // Store options
      this.captureOptions = captureOptions;
      this.isActive = true;

      // Show preview for confirmation (image already cropped by content script)
      await this._showPreview(captureData, "area", captureData.dimensions);
    } catch (error) {
      logME("[CaptureManager] Error processing area capture image:", error);
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
  async _handleAreaSelection(_selectionData) {
    logME(
      "[CaptureManager] Legacy area selection handler called - this should not happen",
    );
    logME(
      "[CaptureManager] Image cropping should be handled in content script now",
    );
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
    logME("[CaptureManager] Capture cancelled by user");
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
      logME("[CaptureManager] Requesting preview display in content script");

      // Get active tab to send preview message
      const [activeTab] = await getbrowser().tabs.query({
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
      await getbrowser().tabs.sendMessage(activeTab.id, {
        action: "SHOW_CAPTURE_PREVIEW",
        data: {
          captureData,
          captureType,
          selectionData,
          translationOptions: this.captureOptions,
        },
      });

      logME("[CaptureManager] Preview request sent to content script");
    } catch (error) {
      logME("[CaptureManager] Error requesting preview display:", error);
      throw this._normalizeError(error, "showPreview");
    }
  }

  /**
   * Handle preview confirmation from content script - start translation
   * @param {Object} captureData - Confirmed capture data
   */
  async handlePreviewConfirm(captureData) {
    try {
      logME("[CaptureManager] Preview confirmed, starting translation");

      // Store current capture data
      this.currentCapture = captureData;

      // Start translation process
      await this._translateCapturedImage(captureData);
    } catch (error) {
      logME("[CaptureManager] Error in preview confirmation:", error);
      handleUIError(this._normalizeError(error, "handlePreviewConfirm"));
    }
  }

  /**
   * Handle preview cancellation from content script
   */
  handlePreviewCancel() {
    logME("[CaptureManager] Preview cancelled");
    this.cleanup();
  }

  /**
   * Handle preview retry from content script - restart capture process
   * @param {string} captureType - Type of capture to retry
   */
  async handlePreviewRetry(captureType) {
    try {
      logME("[CaptureManager] Retrying capture", { captureType });

      // Restart based on capture type
      if (captureType === "area") {
        // For area capture, restart the area selection process
        logME("[CaptureManager] Restarting area capture selection");

        // Get active tab to send area selection restart message
        const [activeTab] = await getbrowser().tabs.query({
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
        await getbrowser().tabs.sendMessage(activeTab.id, {
          action: "START_SCREEN_AREA_SELECTION",
          data: this.captureOptions,
        });

        logME("[CaptureManager] Area capture retry initiated successfully");
      } else {
        // For fullscreen, wait for preview to close then capture again
        logME("[CaptureManager] Restarting fullscreen capture");

        // Add delay to ensure preview window is fully closed and DOM updated
        await new Promise((resolve) => setTimeout(resolve, 500));

        const captureData = await this._captureScreen();
        await this._showPreview(captureData, "fullscreen");

        logME("[CaptureManager] Fullscreen capture retry completed");
      }
    } catch (error) {
      logME("[CaptureManager] Error retrying capture:", error);
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
      logME("[CaptureManager] Starting image translation");

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

      logME("[CaptureManager] Translation completed:", {
        method: extractionResult.method,
        success: !!extractionResult.translatedText,
        textLength: extractionResult.translatedText?.length || 0,
      });

      // Display translation result
      logME("[CaptureManager] About to display result:", {
        translatedText: extractionResult.translatedText,
        translatedTextType: typeof extractionResult.translatedText,
        translatedTextStringified: JSON.stringify(
          extractionResult.translatedText,
        ),
      });

      await this._displayTranslationResult(
        extractionResult.translatedText,
        captureData,
        extractionResult,
      );
    } catch (error) {
      logME("[CaptureManager] Error translating image:", error);
      throw this._normalizeError(error, "translateCapturedImage");
    }
  }

  /**
   * Display translation result in content script
   * @param {string} translationResult - Translated text
   * @param {Object} captureData - Original capture data
   * @param {Object} _extractionMetadata - Text extraction metadata
   * @private
   */
  async _displayTranslationResult(
    translationResult,
    captureData,
    _extractionMetadata = {},
  ) {
    try {
      logME("[CaptureManager] Requesting result display in content script");

      // Use the tab ID from capture data instead of querying for active tab
      // This ensures we send result to the correct tab even if focus has changed
      let targetTabId =
        captureData.tabId || (this.currentCapture && this.currentCapture.tabId);

      if (!targetTabId) {
        logME(
          "[CaptureManager] No tab ID found in capture data, trying active tab fallback",
        );
        // Fallback to active tab query
        const [activeTab] = await getbrowser().tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!activeTab) {
          throw this._createError(
            ErrorTypes.TAB_AVAILABILITY,
            "No active tab found for result display",
          );
        }
        targetTabId = activeTab.id;
      }

      logME("[CaptureManager] Using tab ID for result display:", targetTabId);

      // Send result data to content script
      await getbrowser().tabs.sendMessage(targetTabId, {
        action: "SHOW_CAPTURE_RESULT",
        data: {
          originalCapture: captureData,
          translationText: translationResult,
          position: captureData.position || { x: 100, y: 100 },
        },
      });

      logME("[CaptureManager] Result display request sent to content script");
    } catch (error) {
      logME("[CaptureManager] Error requesting result display:", error);
      throw this._normalizeError(error, "displayTranslationResult");
    }
  }

  /**
   * Handle translation result close from content script
   */
  handleResultClose() {
    logME("[CaptureManager] Translation result closed");
    this.cleanup();
  }

  /**
   * Capture screen using browser API
   * @returns {Promise<Object>} Capture data
   * @private
   */
  async _captureScreen() {
    try {
      logME("[CaptureManager] Capturing screen");

      // Get active tab
      const [activeTab] = await getbrowser().tabs.query({
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
      const dataUrl = await getbrowser().tabs.captureVisibleTab(
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
      logME("[CaptureManager] Error capturing screen:", error);

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
    const provider = ProviderRegistry.getProvider(providerId);
    if (!provider) {
      return false;
    }

    // Only AI providers support image translation
    return provider.category === "ai";
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
    logME("[CaptureManager] Cleaning up");

    this.isActive = false;
    this.currentCapture = null;
    this.captureOptions = null;

    // Note: UI components (screenSelector, capturePreview, captureResult)
    // are now managed in content script, not background script
    this.screenSelector = null;
    this.capturePreview = null;
    this.captureResult = null;
  }

  /**
   * Check if capture is currently active
   * @returns {boolean} True if active
   */
  isCapturing() {
    return this.isActive;
  }
}

// Export singleton instance
export const captureManager = new CaptureManager();
