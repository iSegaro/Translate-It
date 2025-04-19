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
import { logME } from "../utils/helpers.js";
import TranslationHandler from "../core/TranslationHandler.js";

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

  let translated = "";
  try {
    injectPageBridge();

    const response = await smartTranslate(text, mode);

    translated =
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

    // 🔎 ذخیره مقدار قبلی
    let previousValue = "";
    if (target?.isContentEditable) {
      previousValue = target.innerText?.trim();
    } else if ("value" in target) {
      previousValue = target.value?.trim();
    }

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

    // 🔎 بررسی اینکه واقعاً تغییر کرده یا نه
    const newValue =
      target?.isContentEditable ? target.innerText?.trim()
      : "value" in target ? target.value?.trim()
      : null;

    const updated = newValue !== null && newValue === translated;

    if (updated) {
      return; // ✅ با موفقیت تغییر کرد، نیاز به fallback نیست
    }

    logME(
      "[SmartTranslateHandler] Update skipped or blocked, falling back to bridge"
    );
  } catch (error) {
    logME(
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
        translatedText: translated,
      },
    });

    const isSuccess =
      res === true || (typeof res === "object" && res.success === true);

    if (!isSuccess) {
      throw new Error(res?.error || "ترجمه اعمال نشد.");
    }
    // کپی متن ترجمه شده به کلیپبورد
    try {
      await navigator.clipboard.writeText(translated);
      translationHandler.notifier.show(
        "ترجمه در حافظه کپی شد. (Ctrl+V)",
        "success",
        true,
        3000
      );
    } catch (error) {
      translationHandler.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "smartTranslation-Integration-Clipbord",
      });
    }

    logME("[SmartTranslateHandler] Translation applied via fallback bridge.");
  } catch (fallbackErr) {
    logME("[SmartTranslateHandler] Fallback failed:", fallbackErr);
    translationHandler.errorHandler.handle(fallbackErr, {
      type: translationHandler.ErrorTypes.API,
      context: "smartTranslate-fallback-handler",
    });
  }
}
