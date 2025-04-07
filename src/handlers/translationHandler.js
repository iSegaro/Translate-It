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
      TranslationMode.Popup_Translate, // Assuming this mode
      sourceLanguage,
      targetLanguage
    );

    await chrome.storage.local.set({
      lastTranslation: {
        sourceText: promptText,
        translatedText: translation,
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
      },
    });

    sendResponse({ data: { translatedText: translation } });
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
    sendResponse({ error: handledError.message });
  }
  return true; // Must return true because the function is async
}
