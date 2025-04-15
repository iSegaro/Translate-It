// src/handlers/backgroundHandlers.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { TranslationMode } from "../config.js";
import { ErrorTypes } from "../services/ErrorService.js";

// Dependencies passed as arguments: translateText, errorHandler

export async function handleRevertBackground(params) {
  try {
    const [tab] = await Browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.id) {
      logME("[Handler:Revert] No active tab or tab ID found");
      return;
    }

    try {
      await Browser.tabs.sendMessage(tab.id, {
        action: "revertAllAndEscape",
        source: "background",
      });

      // logME(
      //   "[Handler:Revert] Sent 'revertAllAndEscape' action to content script"
      // );
    } catch (sendError) {
      const message = sendError?.message || "";
      if (message.includes("Could not establish connection")) {
        // خطای قابل صرف‌نظر، اغلب در زمان reload یا نبود content script
        // یا وقت‌هایی که در صفحه تنظیمات و یا سایر موارد باشد این خطا رخ میدهد
        return;
      }
      logME(
        "[Handler:Revert] Failed to send message to tab " +
          tab.id +
          ": " +
          message
      );
    }
  } catch (queryError) {
    logME("[Handler:Revert] Failed to query active tab: " + queryError.message);
  }
}

export async function handleFetchTranslation(
  message,
  sender,
  sendResponse,
  translateText,
  errorHandler
) {
  logME("[Handler:Translation] Handling fetchTranslation request");

  try {
    const { promptText, targetLanguage, sourceLanguage, translateMode } =
      message.payload;

    if (!promptText) throw new Error("No text provided for translation.");

    const translation = await translateText(
      promptText,
      translateMode,
      sourceLanguage,
      targetLanguage
    );

    await Browser.storage.local.set({
      lastTranslation: {
        sourceText: promptText,
        translatedText: translation,
        sourceLanguage,
        targetLanguage,
      },
    });

    sendResponse({
      success: true,
      data: {
        translatedText: translation,
      },
    });
  } catch (error) {
    logME("[Handler:Translation] Error processing fetchTranslation:", error);
    const handledError = errorHandler.handle(error, {
      type: ErrorTypes.API,
      context: "handler-fetchTranslation",
      metadata: {
        targetLang: message.payload?.targetLanguage,
        sourceLang: message.payload?.sourceLanguage,
      },
    });

    sendResponse({
      success: false,
      error: handledError.message,
    });
  }

  return true; // Needed because we use sendResponse asynchronously
}

export async function handleFetchTranslationBackground(
  message,
  sender,
  sendResponse,
  translateText,
  errorHandler
) {
  logME(
    "[Handler:Translation-Background] Handling fetchTranslationBackground request"
  );

  try {
    const { promptText, targetLanguage, sourceLanguage, translationMode } =
      message.payload;

    if (!promptText) {
      throw new Error("[Translation-Background] No text provided.");
    }

    const translation = await translateText(
      promptText,
      translationMode,
      sourceLanguage,
      targetLanguage
    );

    if (translationMode !== TranslationMode.SelectElement) {
      await Browser.storage.local.set({
        lastTranslation: {
          sourceText: promptText,
          translatedText: translation,
          sourceLanguage,
          targetLanguage,
        },
      });
    }

    sendResponse({
      success: true,
      data: {
        translatedText: translation,
      },
    });
  } catch (error) {
    logME("[Handler:Translation-Background] Error:", error);

    const handledError = errorHandler.handle(error, {
      type: ErrorTypes.API,
      context: "handler-fetchTranslation-background",
      metadata: {
        targetLang: message.payload?.targetLanguage,
        sourceLang: message.payload?.sourceLanguage,
      },
    });

    sendResponse({
      success: false,
      error: handledError.message,
    });
  }

  return true; // Needed because we use sendResponse asynchronously
}
