// src/handlers/backgroundHandlers.js

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { TranslationMode } from "../config.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { getTranslationString } from "../utils/i18n.js";

// Dependencies passed as arguments: translateText, errorHandler

export async function handleRevertBackground() {
  try {
    const [tab] = await Browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      logME("[Handler:Revert] No active tab or tab ID found");
      return;
    }
    try {
      await Browser.tabs.sendMessage(tab.id, {
        action: "revertAllAndEscape",
        source: "background",
      });
    } catch (sendError) {
      const msg = sendError?.message || "";
      if (msg.includes("Could not establish connection")) return;
      logME(`[Handler:Revert] Failed to send message to tab ${tab.id}: ${msg}`);
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

    // اعتبارسنجی ورودی
    if (!promptText) {
      const err = new Error(ErrorTypes.TEXT_EMPTY);
      err.type = ErrorTypes.TEXT_EMPTY;
      throw err;
    }

    // تماس با سرویس ترجمه
    const translation = await translateText(
      promptText,
      translateMode,
      sourceLanguage,
      targetLanguage
    );

    // بررسی نتیجه
    if (typeof translation !== "string" || !translation.trim()) {
      const err = new Error(ErrorTypes.TRANSLATION_FAILED);
      err.type = ErrorTypes.API;
      throw err;
    }

    // ذخیرهٔ آخرین ترجمه
    await Browser.storage.local.set({
      lastTranslation: {
        sourceText: promptText,
        translatedText: translation,
        sourceLanguage,
        targetLanguage,
      },
    });

    sendResponse({ success: true, data: { translatedText: translation } });
  } catch (err) {
    const processed = await errorHandler.handle(err, {
      type: err.type || ErrorTypes.API,
      context: "handler-fetchTranslation",
      metadata: {
        targetLang: message.payload?.targetLanguage,
        sourceLang: message.payload?.sourceLanguage,
      },
    });

    const safeMessage =
      processed?.message?.trim() ||
      err?.message?.trim() ||
      (await getTranslationString("ERRORS_DURING_TRANSLATE_Fetch")) ||
      "(⚠️ خطایی در ترجمه رخ داد.)";

    sendResponse({ success: false, error: safeMessage });
  }
}

export async function handleFetchTranslationBackground(
  message,
  sender,
  sendResponse,
  translateText,
  errorHandler
) {
  logME("[Background] fetchTranslationBackground");
  try {
    const { promptText, targetLanguage, sourceLanguage, translationMode } =
      message.payload;

    // اعتبارسنجی ورودی
    if (!promptText) {
      const err = new Error(ErrorTypes.PROMPT_INVALID);
      err.type = ErrorTypes.PROMPT_INVALID;
      throw err;
    }

    // تماس با سرویس ترجمه
    const translation = await translateText(
      promptText,
      translationMode,
      sourceLanguage,
      targetLanguage
    );

    // بررسی نتیجه
    if (typeof translation !== "string" || !translation.trim()) {
      throw new Error(ErrorTypes.TRANSLATION_FAILED);
    }

    // ذخیرهٔ آخرین ترجمه (به‌جز SelectElement)
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

    sendResponse({ success: true, data: { translatedText: translation } });
  } catch (err) {
    // logME("[Handler:TranslationBackground] Error:", err);

    const processed = await errorHandler.handle(err, {
      type: err.type || ErrorTypes.API,
      context: "handler-fetchTranslation-background",
      metadata: {
        targetLang: message.payload?.targetLanguage,
        sourceLang: message.payload?.sourceLanguage,
      },
    });

    const safeMessage =
      processed?.message?.trim() ||
      err?.message?.trim() ||
      (await getTranslationString(
        "ERRORS_DURING_TRANSLATE_Fetch_BACKGROUND_FAILED"
      )) ||
      "(⚠️ خطایی در ترجمه رخ داد.)";

    sendResponse({ success: false, error: safeMessage });
  }
}
