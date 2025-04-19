// src/handlers/smartTranslationIntegration.js
import {
  isRestrictedDomain,
  smartTranslate,
  injectPageBridge,
} from "../backgrounds/bridgeIntegration.js";

import { state, TranslationMode } from "../config.js";
import {
  detectPlatform,
  detectPlatformByURL,
} from "../utils/platformDetector.js";
import { getTranslationString } from "../utils/i18n.js";
import Browser from "webextension-polyfill";

export async function translateFieldViaSmartHandler({
  text,
  translationHandler,
  target,
  selectionRange = null,
}) {
  if (!text || !translationHandler) return;

  const mode =
    selectionRange ? TranslationMode.SelectElement : TranslationMode.Field;

  const platform =
    translationHandler.detectPlatform?.(target) ?? detectPlatform(target);

  console.log("[SmartTranslateHandler] Platform detected:", platform);

  try {
    injectPageBridge();

    const response = await smartTranslate(text, mode);
    console.log("[SmartTranslateHandler] Bridge used:", response?.viaBridge);

    let translated =
      response?.data?.translatedText ??
      response?.translatedText ??
      response?.result?.data?.translatedText ??
      response?.result?.translatedText;

    if (typeof translated === "string") {
      translated = translated.trim();
    }

    if (!translated) {
      throw new Error("ترجمه اعمال نشد.");
    }

    console.log("[SmartTranslateHandler] Translated text:", translated);

    // 🔁 حالت عادی (non-restricted)
    if (
      selectionRange &&
      translationHandler.strategies[platform]?.updateElement
    ) {
      await translationHandler.strategies[platform].updateElement(
        selectionRange,
        translated
      );
    } else if (target) {
      await translationHandler.updateTargetElement(target, translated);
    }

    return; // ✅ موفقیت‌آمیز
  } catch (error) {
    console.warn(
      "[SmartTranslateHandler] Direct update failed. Retrying with fallback via content message."
    );
  }

  // 🧠 fallback → ارسال پیام به content script
  try {
    if (target?.focus) {
      target.focus();
      await new Promise((r) => setTimeout(r, 20));
    }

    const res = await Browser.runtime.sendMessage({
      action: "applyTranslationToActiveElement",
      payload: {
        translatedText: text, // ← متن ترجمه‌شده، چون خطای بالا فقط از update بود
      },
    });

    const isSuccess =
      res === true || (typeof res === "object" && res.success === true);

    if (!isSuccess) {
      throw new Error(res?.error || "ترجمه اعمال نشد.");
    }

    console.log(
      "[SmartTranslateHandler] Translation applied via fallback bridge."
    );
  } catch (fallbackErr) {
    console.error("[SmartTranslateHandler] Fallback failed:", fallbackErr);
    translationHandler.errorHandler.handle(fallbackErr, {
      type: translationHandler.ErrorTypes.API,
      context: "smartTranslate-fallback-handler",
    });
  }
}
