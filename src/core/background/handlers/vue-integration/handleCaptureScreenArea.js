// Handler for capturing screen area from Vue apps
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import browser from "webextension-polyfill";
import { ttsStateManager } from '@/features/tts/services/TTSStateManager.js';
import { getSourceLanguageAsync } from "@/shared/config/config.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { toTesseractLanguageCode } from '@/features/screen-capture/utils/ocrLanguageMap.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const errorHandler = new ErrorHandler();
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleCaptureScreenArea');

export async function handleCaptureScreenArea(message, sender, sendResponse) {
  const { coordinates } = message.data;

  try {
    // 1. Capture visible tab
    const imageData = await browser.tabs.captureVisibleTab({
      format: "png",
    });

    // 2. Ensure offscreen document is ready
    await ttsStateManager.ensureOffscreenDocument();

    // 3. Get OCR language mapping
    // We'll use the current source language from settings
    const sourceLang = await getSourceLanguageAsync();
    const tesseractLang = toTesseractLanguageCode(sourceLang);

    // 4. Perform OCR
    let extractedText = '';

    if (browser.offscreen) {
      // Chrome: Send to offscreen for OCR
      const ocrResponse = await browser.runtime.sendMessage({
        target: 'offscreen',
        action: 'OCR_PROCESS',
        data: {
          image: imageData,
          coordinates: coordinates,
          lang: tesseractLang
        }
      });

      if (!ocrResponse || !ocrResponse.success) {
        const errorMsg = ocrResponse?.error || "OCR processing failed";
        logger.error("OCR failed in offscreen:", { error: errorMsg, stack: ocrResponse?.stack });
        throw new Error(errorMsg);
      }
      extractedText = ocrResponse.text;
    } else {
      // Firefox: Run OCR directly in background script (as it has DOM access)
      try {
        const { recognize } = await import('@/features/screen-capture/services/ocrEngine.js');
        extractedText = await recognize(imageData, tesseractLang, coordinates);
      } catch (importError) {
        logger.error("Firefox OCR import failed:", importError);
        throw new Error("OCR engine failed to load in Firefox background");
      }
    }

    // 5. Send message to content script to show preview
    const resultData = {
      text: extractedText,
      imageData,
      coordinates,
      timestamp: Date.now(),
    };

    // Send the OCR result message to the tab that requested it (non-blocking)
    browser.tabs.sendMessage(sender.tab.id, {
      action: MessageActions.SCREEN_CAPTURE_OCR_RESULT,
      data: resultData
    }).catch(msgError => {
      logger.error("Failed to send SCREEN_CAPTURE_OCR_RESULT:", msgError);
    });

    // 6. Return the extracted text (immediate response to sender)
    const response = {
      success: true,
      data: resultData,
    };

    if (sendResponse && typeof sendResponse === 'function') {
      sendResponse(response);
    }

    return response;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleCaptureScreenArea",
      messageData: message.data,
    });
    const errorResponse = { success: false, error: error.message };
    if (sendResponse && typeof sendResponse === 'function') {
      sendResponse(errorResponse);
    }
    return errorResponse;
  }
}