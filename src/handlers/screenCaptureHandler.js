// src/handlers/screenCaptureHandler.js

import browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import {
  getEnableScreenCaptureAsync,
  getSourceLanguageAsync,
  getTargetLanguageAsync,
  getTranslationApiAsync,
} from "../config.js";
import { ProviderRegistry } from "../core/provider-registry.js";
import { captureManager } from "../managers/browser-specific/capture/CaptureManager.js";

/**
 * Handle screen capture requests from sidepanel
 * This handler manages the communication between sidepanel, content script, and background capture logic
 */

/**
 * Handle start area capture request
 * @param {Object} message - Message from sidepanel
 * @param {Object} sender - Message sender info
 * @param {Function} sendResponse - Response callback
 * @param {Function} safeSendMessage - Safe message sending function
 * @param {Object} errorHandler - Error handler instance
 * @param {Object} injectionState - Script injection state
 */
export async function handleStartAreaCapture(
  message,
  sender,
  sendResponse,
  safeSendMessage,
  errorHandler,
  injectionState,
) {
  logME("[Handler:ScreenCapture] Starting area capture request");

  try {
    // 1. Validate screen capture is enabled
    const screenCaptureEnabled = await getEnableScreenCaptureAsync();
    if (!screenCaptureEnabled) {
      throw createScreenCaptureError(
        ErrorTypes.SCREEN_CAPTURE_NOT_SUPPORTED,
        "Screen capture feature is disabled",
      );
    }

    // 2. Get capture settings
    const [sourceLanguage, targetLanguage, provider] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync(),
      getTranslationApiAsync(),
    ]);

    // 3. Validate provider supports image translation
    const providerInfo = ProviderRegistry.getProvider(provider);
    if (!providerInfo || providerInfo.category !== "ai") {
      throw createScreenCaptureError(
        ErrorTypes.PROVIDER_IMAGE_NOT_SUPPORTED,
        "Current provider does not support image translation. Please select an AI provider.",
      );
    }

    // 4. Find active tab
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tabs[0]?.id) {
      throw createScreenCaptureError(
        ErrorTypes.TAB_AVAILABILITY,
        "No active tab found",
      );
    }

    const tabId = tabs[0].id;

    // 5. Send area selection command to content script
    let response = await safeSendMessage(tabId, {
      action: "START_SCREEN_AREA_SELECTION",
      data: {
        sourceLanguage,
        targetLanguage,
        provider,
        captureType: "area",
      },
    });

    // 6. Handle content script injection if needed
    if (response?.error && !injectionState.inProgress) {
      logME(
        "[Handler:ScreenCapture] Content script not available, injecting...",
      );

      injectionState.inProgress = true;
      try {
        await browser.scripting.executeScript({
          target: { tabId },
          files: ["browser-polyfill.js", "content.bundle.js"],
        });

        // Retry after injection
        response = await safeSendMessage(tabId, {
          action: "START_SCREEN_AREA_SELECTION",
          data: {
            sourceLanguage,
            targetLanguage,
            provider,
            captureType: "area",
          },
        });

        if (response?.error) {
          throw createScreenCaptureError(
            ErrorTypes.INTEGRATION,
            `Content script communication failed: ${response.error}`,
          );
        }
      } catch (injectionErr) {
        logME("[Handler:ScreenCapture] Script injection failed:", injectionErr);
        throw createScreenCaptureError(
          ErrorTypes.INTEGRATION,
          "Could not inject content script for screen capture",
        );
      } finally {
        injectionState.inProgress = false;
      }
    }

    logME("[Handler:ScreenCapture] Area capture initiated successfully");
    sendResponse({ success: true, message: "Area selection started" });
  } catch (error) {
    logME("[Handler:ScreenCapture] Error in area capture:", error);
    await errorHandler.handle(error, {
      type: error.type || ErrorTypes.SCREEN_CAPTURE_FAILED,
      context: "handler-screenCapture-area",
    });
    sendResponse({
      success: false,
      error: error.message || "Failed to start area capture",
    });
    if (injectionState.inProgress) injectionState.inProgress = false;
  }
}

/**
 * Handle start full screen capture request
 * @param {Object} message - Message from sidepanel
 * @param {Object} sender - Message sender info
 * @param {Function} sendResponse - Response callback
 * @param {Function} safeSendMessage - Safe message sending function
 * @param {Object} errorHandler - Error handler instance
 * @param {Object} injectionState - Script injection state
 */
export async function handleStartFullScreenCapture(
  message,
  sender,
  sendResponse,
  safeSendMessage,
  errorHandler,
  _injectionState,
) {
  logME("[Handler:ScreenCapture] Starting full screen capture request");

  try {
    // 1. Validate screen capture is enabled
    const screenCaptureEnabled = await getEnableScreenCaptureAsync();
    if (!screenCaptureEnabled) {
      throw createScreenCaptureError(
        ErrorTypes.SCREEN_CAPTURE_NOT_SUPPORTED,
        "Screen capture feature is disabled",
      );
    }

    // 2. Get capture settings
    const [sourceLanguage, targetLanguage, provider] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync(),
      getTranslationApiAsync(),
    ]);

    // 3. Validate provider supports image translation
    const providerInfo = ProviderRegistry.getProvider(provider);
    if (!providerInfo || providerInfo.category !== "ai") {
      throw createScreenCaptureError(
        ErrorTypes.PROVIDER_IMAGE_NOT_SUPPORTED,
        "Current provider does not support image translation. Please select an AI provider.",
      );
    }

    // 4. Start full screen capture directly (no area selection needed)
    await captureManager.startFullScreenCapture({
      sourceLanguage,
      targetLanguage,
      provider,
    });

    logME("[Handler:ScreenCapture] Full screen capture completed successfully");
    sendResponse({ success: true, message: "Full screen capture completed" });
  } catch (error) {
    logME("[Handler:ScreenCapture] Error in full screen capture:", error);
    await errorHandler.handle(error, {
      type: error.type || ErrorTypes.SCREEN_CAPTURE_FAILED,
      context: "handler-screenCapture-fullscreen",
    });
    sendResponse({
      success: false,
      error: error.message || "Failed to complete full screen capture",
    });
  }
}

/**
 * Handle request for full screen capture (for cropping in content script)
 * @param {Object} message - Request message
 * @param {Object} sender - Message sender info
 * @param {Function} sendResponse - Response callback
 * @param {Object} errorHandler - Error handler instance
 */
export async function handleRequestFullScreenCapture(
  message,
  sender,
  sendResponse,
  errorHandler,
) {
  logME("[Handler:ScreenCapture] Request for full screen capture received");

  try {
    // Get active tab
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tabs[0]?.id) {
      throw createScreenCaptureError(
        ErrorTypes.TAB_AVAILABILITY,
        "No active tab found for capture",
      );
    }

    const activeTab = tabs[0];

    // Capture visible tab
    const dataUrl = await browser.tabs.captureVisibleTab(activeTab.windowId, {
      format: "png",
      quality: 100,
    });

    const captureData = {
      imageData: dataUrl,
      timestamp: Date.now(),
      tabId: activeTab.id,
      url: activeTab.url,
    };

    logME("[Handler:ScreenCapture] Full screen capture completed for cropping");
    sendResponse({
      success: true,
      ...captureData,
    });
  } catch (error) {
    logME("[Handler:ScreenCapture] Error capturing full screen:", error);

    let errorType = ErrorTypes.SCREEN_CAPTURE_FAILED;
    if (error.message?.includes("permission")) {
      errorType = ErrorTypes.SCREEN_CAPTURE_PERMISSION_DENIED;
    }

    await errorHandler.handle(error, {
      type: errorType,
      context: "handler-screenCapture-fullRequest",
    });

    sendResponse({
      success: false,
      error: error.message || "Failed to capture screen",
    });
  }
}

/**
 * Handle processed area capture image from content script
 * @param {Object} message - Message containing cropped image data
 * @param {Object} sender - Message sender info
 * @param {Function} sendResponse - Response callback
 * @param {Object} errorHandler - Error handler instance
 */
export async function handleProcessAreaCaptureImage(
  message,
  sender,
  sendResponse,
  errorHandler,
) {
  logME("[Handler:ScreenCapture] Processing cropped area capture image");

  try {
    const { imageData, selectionData, captureOptions, originalCapture } =
      message.data;

    if (!imageData || !selectionData || !captureOptions) {
      throw createScreenCaptureError(
        ErrorTypes.INTEGRATION,
        "Invalid area capture image data received",
      );
    }

    // Create capture data object for CaptureManager
    const captureData = {
      imageData,
      timestamp: Date.now(),
      tabId: originalCapture.tabId,
      url: originalCapture.url,
      position: { x: selectionData.x, y: selectionData.y },
      dimensions: {
        width: selectionData.width,
        height: selectionData.height,
      },
    };

    // Process with CaptureManager (preview and translation)
    await captureManager.processAreaCaptureImage(captureData, captureOptions);

    logME("[Handler:ScreenCapture] Area capture image processed successfully");
    sendResponse({ success: true, message: "Area capture completed" });
  } catch (error) {
    logME(
      "[Handler:ScreenCapture] Error processing area capture image:",
      error,
    );
    await errorHandler.handle(error, {
      type: error.type || ErrorTypes.SCREEN_CAPTURE_FAILED,
      context: "handler-screenCapture-processImage",
    });
    sendResponse({
      success: false,
      error: error.message || "Failed to process area capture image",
    });
  }
}

/**
 * Handle preview confirmation from content script
 * @param {Object} message - Confirmation message with capture data
 * @param {Object} sender - Message sender info
 * @param {Function} sendResponse - Response callback
 * @param {Object} errorHandler - Error handler instance
 */
export async function handlePreviewConfirmed(
  message,
  sender,
  sendResponse,
  errorHandler,
) {
  logME("[Handler:ScreenCapture] Preview confirmed, starting translation");

  try {
    const { captureData, translationOptions } = message.data;

    if (!captureData || !translationOptions) {
      throw createScreenCaptureError(
        ErrorTypes.INTEGRATION,
        "Invalid preview confirmation data received",
      );
    }

    // Process with CaptureManager
    await captureManager.handlePreviewConfirm(captureData);

    logME(
      "[Handler:ScreenCapture] Preview confirmation processed successfully",
    );
    sendResponse({ success: true, message: "Translation started" });
  } catch (error) {
    logME(
      "[Handler:ScreenCapture] Error processing preview confirmation:",
      error,
    );
    await errorHandler.handle(error, {
      type: error.type || ErrorTypes.SCREEN_CAPTURE_FAILED,
      context: "handler-screenCapture-previewConfirm",
    });
    sendResponse({
      success: false,
      error: error.message || "Failed to process preview confirmation",
    });
  }
}

/**
 * Handle preview cancellation from content script
 * @param {Object} message - Cancellation message
 * @param {Object} sender - Message sender info
 * @param {Function} sendResponse - Response callback
 */
export function handlePreviewCancelled(message, sender, sendResponse) {
  logME("[Handler:ScreenCapture] Preview cancelled by user");

  // Clean up capture operations
  captureManager.handlePreviewCancel();

  sendResponse({ success: true, message: "Preview cancelled" });
}

/**
 * Handle preview retry from content script
 * @param {Object} message - Retry message
 * @param {Object} sender - Message sender info
 * @param {Function} sendResponse - Response callback
 * @param {Object} errorHandler - Error handler instance
 */
export async function handlePreviewRetry(
  message,
  sender,
  sendResponse,
  errorHandler,
) {
  logME("[Handler:ScreenCapture] Preview retry requested");
  logME("[Handler:ScreenCapture] Preview retry message data:", {
    messageData: message.data,
    hasData: !!message.data,
    captureType: message.data?.captureType,
  });

  try {
    const { captureType } = message.data;

    if (!captureType) {
      throw createScreenCaptureError(
        ErrorTypes.INTEGRATION,
        "Invalid preview retry data received",
      );
    }

    // Process retry with CaptureManager
    await captureManager.handlePreviewRetry(captureType);

    logME("[Handler:ScreenCapture] Preview retry processed successfully");
    sendResponse({ success: true, message: "Retry initiated" });
  } catch (error) {
    logME("[Handler:ScreenCapture] Error processing preview retry:", error);
    await errorHandler.handle(error, {
      type: error.type || ErrorTypes.SCREEN_CAPTURE_FAILED,
      context: "handler-screenCapture-previewRetry",
    });
    sendResponse({
      success: false,
      error: error.message || "Failed to process preview retry",
    });
  }
}

/**
 * Handle result closed from content script
 * @param {Object} message - Close message
 * @param {Object} sender - Message sender info
 * @param {Function} sendResponse - Response callback
 */
export function handleResultClosed(message, sender, sendResponse) {
  logME("[Handler:ScreenCapture] Result closed by user");

  // Clean up capture operations
  captureManager.handleResultClose();

  sendResponse({ success: true, message: "Result closed" });
}

/**
 * Handle capture errors from content script
 * @param {Object} message - Error message
 * @param {Object} sender - Message sender info
 * @param {Function} sendResponse - Response callback
 */
export function handleCaptureError(message, sender, sendResponse) {
  logME(
    "[Handler:ScreenCapture] Capture error reported from content script:",
    message.data,
  );

  // Clean up capture operations
  captureManager.cleanup();

  sendResponse({ success: true, message: "Error handled" });
}

/**
 * Handle area selection cancellation from content script
 * @param {Object} message - Cancellation message
 * @param {Object} sender - Message sender info
 * @param {Function} sendResponse - Response callback
 */
export function handleAreaSelectionCancel(message, sender, sendResponse) {
  logME("[Handler:ScreenCapture] Area selection cancelled by user");

  // Clean up any pending capture operations
  captureManager.cleanup();

  sendResponse({ success: true, message: "Area selection cancelled" });
}

/**
 * Create a standardized screen capture error
 * @param {string} type - Error type
 * @param {string} message - Error message
 * @returns {Error} Screen capture error
 */
function createScreenCaptureError(type, message) {
  const error = new Error(message);
  error.type = type;
  error.context = "screen-capture-handler";
  return error;
}
