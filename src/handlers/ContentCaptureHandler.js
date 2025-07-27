// src/handlers/ContentCaptureHandler.js

import { logME } from "../utils/helpers.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { ScreenSelector } from "../capture/ScreenSelector.js";
import { CapturePreview } from "../capture/CapturePreview.js";
import { CaptureResult } from "../capture/CaptureResult.js";
import { cropImageData } from "../utils/imageProcessing.js";
import { Browser } from "@/utils/browser-polyfill.js";

/**
 * Content Script handler for Screen Capture functionality
 * Manages the entire screen capture workflow in content script context
 */
export class ContentCaptureHandler {
  constructor() {
    // Screen capture components
    this.screenSelector = null;
    this.capturePreview = null;
    this.captureResult = null;
    
    // Bind methods for event handlers
    this.handleAreaSelectionComplete = this.handleAreaSelectionComplete.bind(this);
    this.handlePreviewConfirm = this.handlePreviewConfirm.bind(this);
    this.handlePreviewCancel = this.handlePreviewCancel.bind(this);
    this.handlePreviewRetry = this.handlePreviewRetry.bind(this);
    this.handleResultClose = this.handleResultClose.bind(this);
  }

  /**
   * Start screen area selection process
   * @param {Object} captureOptions - Capture configuration options
   */
  startScreenAreaSelection(captureOptions) {
    try {
      logME("[ContentCaptureHandler] Starting screen area selection", captureOptions);
      logME("[ContentCaptureHandler] Initializing screen area selection on page", {
        url: window.location.href,
        hasOptions: !!captureOptions
      });

      // Clean up any existing screen selector
      if (this.screenSelector) {
        this.screenSelector.cleanup();
        this.screenSelector = null;
      }

      // Create new screen selector with area selection callback
      this.screenSelector = new ScreenSelector({
        onSelectionComplete: (selectionData) => {
          this.handleAreaSelectionComplete(selectionData, captureOptions);
        },
        onCancel: () => {
          logME("[ContentCaptureHandler] Area selection cancelled");
          this.cleanup();
        }
      });

      // Start area selection
      this.screenSelector.start();
      logME("[ContentCaptureHandler] Screen area selection started successfully");

    } catch (error) {
      logME("[ContentCaptureHandler] Error starting area selection:", error);
      this.handleCaptureError(error, "area-selection");
    }
  }

  /**
   * Handle completion of area selection - crop image and show preview
   * @param {Object} selectionData - Selected area coordinates
   * @param {Object} captureOptions - Original capture options
   */
  async handleAreaSelectionComplete(selectionData, captureOptions) {
    try {
      logME("[ContentCaptureHandler] Area selection completed:", selectionData);

      // First request full screen capture from background
      const fullCaptureResponse = await Browser.runtime.sendMessage({
        action: "requestFullScreenCapture",
        data: {}
      });

      if (!fullCaptureResponse || fullCaptureResponse.error) {
        throw new Error(fullCaptureResponse.error || "Failed to capture full screen");
      }

      logME("[ContentCaptureHandler] Cropping captured image to selected area");

      // Crop the image to selected area using imageProcessing utility
      const croppedImageData = await cropImageData(
        fullCaptureResponse.imageData,
        selectionData
      );

      // Send cropped image to background for processing
      await Browser.runtime.sendMessage({
        action: "processAreaCaptureImage",
        data: {
          imageData: croppedImageData,
          timestamp: Date.now(),
          selectionData,
          captureOptions,
          originalCapture: fullCaptureResponse
        }
      });

      // Clean up screen selector
      if (this.screenSelector) {
        this.screenSelector.cleanup();
        this.screenSelector = null;
      }

    } catch (error) {
      logME("[ContentCaptureHandler] Error in area selection completion:", error);
      this.handleCaptureError(error, "area-completion");
    }
  }

  /**
   * Show capture preview modal
   * @param {Object} previewData - Preview data from background
   */
  async showCapturePreview(previewData) {
    try {
      logME("[ContentCaptureHandler] Showing capture preview", previewData);
      logME("[ContentCaptureHandler] Showing capture preview modal", {
        hasData: !!previewData.captureData,
        captureType: previewData.captureType
      });

      // Clean up any existing preview
      if (this.capturePreview) {
        this.capturePreview.cleanup();
        this.capturePreview = null;
      }

      // Create new preview instance
      this.capturePreview = new CapturePreview({
        captureData: previewData.captureData,
        captureType: previewData.captureType,
        selectionData: previewData.selectionData,
        onConfirm: (captureData) => {
          this.handlePreviewConfirm(captureData, previewData.translationOptions);
        },
        onCancel: () => {
          this.handlePreviewCancel();
        },
        onRetry: (captureType) => {
          this.handlePreviewRetry(captureType);
        }
      });

      // Show the preview
      await this.capturePreview.show();
      logME("[ContentCaptureHandler] Capture preview shown successfully");

    } catch (error) {
      logME("[ContentCaptureHandler] Error showing capture preview:", error);
      this.handleCaptureError(error, "preview");
    }
  }

  /**
   * Show capture translation result
   * @param {Object} resultData - Result data from background
   */
  async showCaptureResult(resultData) {
    try {
      logME("[ContentCaptureHandler] Showing capture result", resultData);
      logME("[ContentCaptureHandler] Showing capture result", {
        hasTranslation: !!resultData.translationText,
        translationText: resultData.translationText,
        translationTextType: typeof resultData.translationText,
        position: resultData.position
      });

      // Clean up any existing result
      if (this.captureResult) {
        this.captureResult.cleanup();
        this.captureResult = null;
      }

      // Create new result instance
      this.captureResult = new CaptureResult({
        originalCapture: resultData.originalCapture,
        translationText: resultData.translationText,
        position: resultData.position || { x: 100, y: 100 },
        onClose: () => {
          this.handleResultClose();
        }
      });

      // Show the result
      await this.captureResult.show();
      logME("[ContentCaptureHandler] Capture result shown successfully");

    } catch (error) {
      logME("[ContentCaptureHandler] Error showing capture result:", error);
      this.handleCaptureError(error, "result");
    }
  }

  /**
   * Handle preview confirmation - send to background for translation
   * @param {Object} captureData - Confirmed capture data
   * @param {Object} translationOptions - Translation options
   */
  async handlePreviewConfirm(captureData, translationOptions) {
    try {
      logME("[ContentCaptureHandler] Preview confirmed, starting translation");

      // Clean up preview
      if (this.capturePreview) {
        this.capturePreview.cleanup();
        this.capturePreview = null;
      }

      // Send confirmation to background for translation
      await Browser.runtime.sendMessage({
        action: "previewConfirmed",
        data: {
          captureData,
          translationOptions
        }
      });

    } catch (error) {
      logME("[ContentCaptureHandler] Error confirming preview:", error);
      this.handleCaptureError(error, "preview-confirm");
    }
  }

  /**
   * Handle preview cancellation
   */
  handlePreviewCancel() {
    try {
      logME("[ContentCaptureHandler] Preview cancelled");

      // Clean up preview
      if (this.capturePreview) {
        this.capturePreview.cleanup();
        this.capturePreview = null;
      }

      // Notify background
      Browser.runtime.sendMessage({
        action: "previewCancelled",
        data: {}
      }).catch(error => {
        logME("[ContentCaptureHandler] Error sending preview cancel:", error);
      });

    } catch (error) {
      logME("[ContentCaptureHandler] Error in preview cancel:", error);
    }
  }

  /**
   * Handle preview retry request
   * @param {string} captureType - Type of capture to retry
   */
  handlePreviewRetry(captureType) {
    try {
      logME("[ContentCaptureHandler] Preview retry requested:", captureType);

      // Clean up preview
      if (this.capturePreview) {
        this.capturePreview.cleanup();
        this.capturePreview = null;
      }

      // Send retry request to background
      Browser.runtime.sendMessage({
        action: "previewRetry",
        data: { captureType }
      }).catch(error => {
        logME("[ContentCaptureHandler] Error sending preview retry:", error);
      });

    } catch (error) {
      logME("[ContentCaptureHandler] Error in preview retry:", error);
    }
  }

  /**
   * Handle result window close
   */
  handleResultClose() {
    try {
      logME("[ContentCaptureHandler] Result closed");

      // Clean up result
      if (this.captureResult) {
        this.captureResult.cleanup();
        this.captureResult = null;
      }

      // Notify background if needed
      Browser.runtime.sendMessage({
        action: "resultClosed",
        data: {}
      }).catch(error => {
        logME("[ContentCaptureHandler] Error sending result close:", error);
      });

    } catch (error) {
      logME("[ContentCaptureHandler] Error in result close:", error);
    }
  }

  /**
   * Handle capture-related errors
   * @param {Error} error - The error that occurred
   * @param {string} context - Context where error occurred
   */
  handleCaptureError(error, context) {
    logME("[ContentCaptureHandler] Screen capture error:", error);

    // Clean up all capture components
    if (this.screenSelector) {
      this.screenSelector.cleanup();
      this.screenSelector = null;
    }

    if (this.capturePreview) {
      this.capturePreview.cleanup();
      this.capturePreview = null;
    }

    if (this.captureResult) {
      this.captureResult.cleanup();
      this.captureResult = null;
    }

    // Send error to background
    Browser.runtime.sendMessage({
      action: "captureError",
      data: {
        error: error.message,
        context,
        type: error.type || ErrorTypes.SCREEN_CAPTURE
      }
    }).catch(sendError => {
      logME("[ContentCaptureHandler] Error sending capture error:", sendError);
    });

    // Show user-friendly error message
    this._showErrorNotification(
      `Screen capture ${context} failed. Please try again.`,
      error
    );
  }

  /**
   * Clean up all capture components
   */
  cleanup() {
    logME("[ContentCaptureHandler] Cleaning up capture components");

    if (this.screenSelector) {
      this.screenSelector.cleanup();
      this.screenSelector = null;
    }

    if (this.capturePreview) {
      this.capturePreview.cleanup();
      this.capturePreview = null;
    }

    if (this.captureResult) {
      this.captureResult.cleanup();
      this.captureResult = null;
    }
  }

  /**
   * Show error notification to user
   * @param {string} message - Error message
   * @param {Error} error - Original error object
   * @private
   */
  _showErrorNotification(message, error) {
    // Send error notification request to background
    Browser.runtime.sendMessage({
      action: "SHOW_ERROR_NOTIFICATION",
      data: {
        message,
        error: error.message,
        type: error.type || ErrorTypes.SCREEN_CAPTURE
      }
    }).catch(sendError => {
      logME("[ContentCaptureHandler] Error sending error notification:", sendError);
    });
  }

  /**
   * Check if any capture component is currently active
   * @returns {boolean} True if any capture component is active
   */
  isActive() {
    return !!(this.screenSelector || this.capturePreview || this.captureResult);
  }

  /**
   * Get current capture status
   * @returns {Object} Status object with component states
   */
  getStatus() {
    return {
      screenSelector: !!this.screenSelector,
      capturePreview: !!this.capturePreview,
      captureResult: !!this.captureResult,
      isActive: this.isActive()
    };
  }
}
