// Handler for capturing screen area from Vue apps
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import browser from "webextension-polyfill";
import { ttsStateManager } from '@/features/tts/services/TTSStateManager.js';
import { getSourceLanguageAsync } from "@/shared/config/config.js";

const errorHandler = new ErrorHandler();

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
    
    // Tesseract mapping (from our store logic, simplified here)
    // In a real app, we might want to get this from the ocrStore
    const langMapping = {
      'en': 'eng', 'fa': 'fas', 'fr': 'fra', 'de': 'deu', 'es': 'spa',
      'it': 'ita', 'pt': 'por', 'ru': 'rus', 'zh-cn': 'chi_sim',
      'zh-tw': 'chi_tra', 'ja': 'jpn', 'ko': 'kor', 'ar': 'ara'
    };
    const tesseractLang = langMapping[sourceLang] || 'eng';

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
        console.error("[handleCaptureScreenArea] OCR failed in offscreen:", errorMsg, ocrResponse?.stack);
        throw new Error(errorMsg);
      }
      extractedText = ocrResponse.text;
    } else {
      // Firefox: Run OCR directly in background script (as it has DOM access)
      try {
        const { recognize } = await import('@/features/screen-capture/services/ocrEngine.js');
        extractedText = await recognize(imageData, tesseractLang, coordinates);
      } catch (importError) {
        console.error("Firefox OCR import failed:", importError);
        throw new Error("OCR engine failed to load in Firefox background");
      }
    }

    // 5. Return the extracted text
    const response = {
      success: true,
      data: {
        text: extractedText,
        imageData,
        coordinates,
        timestamp: Date.now(),
      },
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
    return { success: false, error: error.message };
  }
}