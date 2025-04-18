// src/handlers/backgroundHandlers.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { TranslationMode } from "../config.js";
import { ErrorTypes } from "../services/ErrorService.js";
import { getTranslationString } from "../utils/i18n.js";

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

    /* تماس با سرویس ترجمه */
    const translation = await translateText(
      promptText,
      translateMode,
      sourceLanguage,
      targetLanguage
    );

    /* ───────── چکِ صحّت خروجی ───────── */
    // ➊ ترجمه باید رشتهٔ غیرخالی **و فاقد عبارت خطا** باشد
    const isErrorLike = (str) =>
      /^ *(error|fail|invalid|خطا)/i.test(str) || str.includes("❌");

    if (
      typeof translation !== "string" ||
      !translation.trim() ||
      isErrorLike(translation)
    ) {
      const err =
        translation instanceof Error ? translation : (
          new Error(
            typeof translation === "string" && translation.trim() ?
              translation
            : "(Translation failed.)"
          )
        );
      throw err; // از مسیر catch به sendResponse(error) می‌رویم
    }

    /* ذخیرهٔ آخرین ترجمه */
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
    logME("[Handler:Translation] Error:", err);

    // خطای نرمال‌شده با پیام قابل‌نمایش برمی‌گردد
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

    if (!promptText) throw new Error("No text provided.");

    /* تماس با سرویس ترجمه */
    const translation = await translateText(
      promptText,
      translationMode,
      sourceLanguage,
      targetLanguage
    );
    /* ــ ترجمه باید رشتهٔ غیرخالی باشد ــ */
    if (typeof translation !== "string" || !translation.trim()) {
      const errMsg =
        typeof translation === "string" && translation ?
          translation
        : await getTranslationString(
            "ERRORS_DURING_TRANSLATE_Fetch_BACKGROUND"
          );

      /* لاگ و هندل خطا (اختیاری) */
      await errorHandler.handle(new Error(errMsg), {
        type: ErrorTypes.API,
        context: "handler-fetchTranslation-background",
      });

      sendResponse({ success: false, error: errMsg });
      return true;
    }
    /* ───────── چکِ صحّت خروجی ───────── */
    if (typeof translation !== "string" || !translation.trim()) {
      const errMsg =
        translation instanceof Error ?
          translation.message
        : translation ||
          (await getTranslationString(
            "ERRORS_DURING_TRANSLATE_Fetch_BACKGROUND_FAILED_RESPONSE"
          )) ||
          "(Translation failed.)";
      throw new Error(errMsg);
    }

    /* ذخیرهٔ آخرین ترجمه (به‌جز حالت Select‑Element) */
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
    logME("[Handler:Translation] Error:", err);

    // خطای نرمال‌شده با پیام قابل‌نمایش برمی‌گردد
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
      (await getTranslationString(
        "ERRORS_DURING_TRANSLATE_Fetch_BACKGROUND_FAILED"
      )) ||
      "(⚠️ خطایی در ترجمه رخ داد.)";

    sendResponse({ success: false, error: safeMessage });
  }
}
