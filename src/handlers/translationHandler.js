import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { TranslationMode } from "../config.js";
import { ErrorTypes } from "../services/ErrorService.js";

// Dependencies passed as arguments: translateText, errorHandler

export async function handleFetchTranslation(
  message,
  sender,
  sendResponse,
  translateText,
  errorHandler
) {
  logME("[Handler:Translation] Handling fetchTranslation request");

  try {
    const { promptText, targetLanguage, sourceLanguage } = message.payload;

    if (!promptText) throw new Error("No text provided for translation.");

    const translation = await translateText(
      promptText,
      TranslationMode.Popup_Translate,
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
  logME("[Handler:Translation-Background] Handling fetchTranslation request");

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
