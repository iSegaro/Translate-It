// Handler for capturing screen area from Vue apps
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import browser from "webextension-polyfill";
import { offscreenRuntimeLeaseManager } from '@/shared/runtime/OffscreenRuntimeLeaseManager.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { toTesseractLanguageCode } from '@/features/screen-capture/utils/ocrLanguageMap.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const errorHandler = new ErrorHandler();
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleCaptureScreenArea');
let fallbackLeaseCounter = 0;

function createScreenCaptureLeaseId(captureId) {
  if ((typeof captureId === 'string' || typeof captureId === 'number') && String(captureId).trim()) {
    return String(captureId);
  }

  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `screen-capture-${globalThis.crypto.randomUUID()}`;
  }

  fallbackLeaseCounter += 1;
  return `screen-capture-${Date.now()}-${fallbackLeaseCounter}-${Math.random().toString(36).slice(2)}`;
}

function normalizeErrorMessage(error, fallback = 'Screen capture failed') {
  if (typeof error === 'string' && error) return error;
  if (typeof error?.message === 'string' && error.message) return error.message;
  if (typeof error?.error === 'string' && error.error) return error.error;
  if (typeof error?.error?.message === 'string' && error.error.message) return error.error.message;
  return fallback;
}

function getErrorType(error) {
  if (typeof error?.type === 'string' && error.type) return error.type;
  if (typeof error?.errorType === 'string' && error.errorType) return error.errorType;
  return null;
}

export async function handleCaptureScreenArea(message, sender, sendResponse) {
  const { coordinates, ocrLang: requestedOcrLang, captureId } = message.data;
  let screenCaptureLease;
  let useOffscreenOcr = false;
  const isFirefoxBuild = typeof __BROWSER__ !== 'undefined' && __BROWSER__ === 'firefox';

  try {
    // 1. Capture visible tab
    const imageData = await browser.tabs.captureVisibleTab({
      format: "png",
    });

    // 2. Acquire the lease before choosing the OCR execution context
    const requestedLease = {
      owner: 'screen-capture',
      leaseId: createScreenCaptureLeaseId(captureId),
      requiredReasons: ['WORKERS'],
    };
    if (typeof offscreenRuntimeLeaseManager?.acquire === 'function') {
      useOffscreenOcr = await offscreenRuntimeLeaseManager.acquire(requestedLease);
      if (useOffscreenOcr) {
        screenCaptureLease = requestedLease;
      }
    }

    if (!isFirefoxBuild && !useOffscreenOcr) {
      const unsupportedError = new Error('Screen capture is not supported in this browser or context.');
      unsupportedError.type = ErrorTypes.SCREEN_CAPTURE_NOT_SUPPORTED;
      throw unsupportedError;
    }

    // 3. Get OCR language mapping
    // Priority: 1. Manually requested via UI, 2. runtime OCR_DEFAULT_LANG, 3. current source language
    const [ocrDefaultLang, sourceLanguage] = await Promise.all([
      settingsManager.getAsync('OCR_DEFAULT_LANG'),
      settingsManager.getAsync('SOURCE_LANGUAGE')
    ]);

    const ocrLang = requestedOcrLang || ocrDefaultLang || sourceLanguage || 'eng';
    const tesseractLang = toTesseractLanguageCode(ocrLang === 'auto' ? 'eng' : ocrLang);

    logger.debug(`Starting OCR with language: ${tesseractLang}`, { requestedOcrLang });

    // 4. Perform OCR
    let extractedText = '';

    if (useOffscreenOcr) {
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
        const errorMsg = normalizeErrorMessage(ocrResponse?.error, "OCR processing failed");
        logger.error("OCR failed in offscreen:", { error: errorMsg, stack: ocrResponse?.stack });
        const ocrError = new Error(errorMsg);
        const errorType = getErrorType(ocrResponse?.error) || getErrorType(ocrResponse);
        if (errorType) ocrError.type = errorType;
        throw ocrError;
      }
      
      // Robustly handle different response formats from offscreen context
      extractedText = ocrResponse.text || ocrResponse.data?.text || '';
      logger.info("OCR completed in offscreen context", { 
        textLength: extractedText.length,
        hasCoordinates: !!coordinates 
      });
    } else {
      // Firefox: Run OCR directly in background script (as it has DOM access)
      try {
        const { recognize } = await import('@/features/screen-capture/services/ocrEngine.js');
        extractedText = await recognize(imageData, tesseractLang, coordinates);
        logger.info("OCR completed in background context (Firefox)", { 
          textLength: extractedText.length,
          hasCoordinates: !!coordinates 
        });
      } catch (importError) {
        logger.error("Firefox OCR import failed:", importError);
        throw new Error("OCR engine failed to load in Firefox background");
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
      logger.debug("OCR extracted empty text. Capture may have failed to find characters.");
    }

    // 5. Send message to content script to show preview
    const resultData = {
      text: extractedText,
      imageData,
      coordinates,
      timestamp: Date.now(),
      captureType: coordinates ? 'area' : 'fullscreen',
      captureId
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
    const errorResponse = {
      success: false,
      error: normalizeErrorMessage(error),
    };
    const errorType = getErrorType(error);
    if (errorType) errorResponse.errorType = errorType;
    if (sendResponse && typeof sendResponse === 'function') {
      sendResponse(errorResponse);
    }
    return errorResponse;
  } finally {
    if (screenCaptureLease) {
      try {
        await offscreenRuntimeLeaseManager.release(screenCaptureLease);
      } catch (releaseError) {
        logger.debug('Screen-capture offscreen lease release failed:', releaseError);
      }
    }
  }
}
