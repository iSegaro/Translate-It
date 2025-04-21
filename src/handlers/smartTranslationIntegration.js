// src/handlers/smartTranslationIntegration.js
import {
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
import { ErrorTypes } from "../services/ErrorService.js";

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

    if (response?.success === false) {
      const err = new Error(response?.error || "(خطایی رخ داد)");
      await translationHandler.errorHandler.handle(err, {
        type: ErrorTypes.API,
        context: "smartTranslate-response-handler",
        statusCode: response?.statusCode || 400,
        isPrimary: true,
      });
      return;
    }

    translated =
      response?.data?.translatedText ??
      response?.translatedText ??
      response?.result?.data?.translatedText ??
      response?.result?.translatedText;

    if (!translated || typeof translated !== "string") {
      await translationHandler.errorHandler.handle(
        new Error("(Translation not found)"),
        {
          type: ErrorTypes.API,
          context: "smartTranslate-handler-main",
          isPrimary: true,
        }
      );
      return;
    }

    translated = translated.trim();

    // اگر target موجود باشد، مقدار اولیه را نگه‌دار
    const beforeValue =
      target?.isContentEditable ? target.innerText?.trim()
      : target && "value" in target ? target.value?.trim()
      : null;

    logME("[SmartTranslateHandler] Initial value:", beforeValue);

    // اجرای strategy
    let didApply = false;

    if (
      selectionRange &&
      translationHandler.strategies[platform]?.updateElement
    ) {
      didApply = await translationHandler.strategies[platform].updateElement(
        selectionRange,
        translated
      );
    } else if (target) {
      didApply = await translationHandler.updateTargetElement(
        target,
        translated
      );
    }

    logME("[SmartTranslateHandler] updateElement result:", didApply);

    // اگر استراتژی گفته که موفق بوده، کافیه!
    if (didApply === true) {
      logME("[SmartTranslateHandler] Strategy applied successfully");
      return;
    }

    // بررسی نهایی: آیا مقدار تغییر کرده؟

    const initialValue =
      target?.isContentEditable ? target.innerText?.trim()
      : typeof target === "object" && target !== null && "value" in target ?
        target.value?.trim()
      : null;
    logME("[SmartTranslateHandler] Initial value:", initialValue);

    logME("[SmartTranslateHandler] Direct DOM check:", {
      before: beforeValue,
      after: initialValue,
      expected: translated,
    });

    if (initialValue === translated) {
      logME(
        "[SmartTranslateHandler] DOM updated correctly. No fallback needed."
      );
      return;
    }

    logME("[SmartTranslateHandler] ❗ Fallback required");

    // --- fallback ---
    const res = await Browser.runtime.sendMessage({
      action: "applyTranslationToActiveElement",
      payload: { translatedText: translated },
    });

    const isSuccess =
      res === true || (typeof res === "object" && res.success === true);

    if (!isSuccess) {
      throw new Error(
        res?.error ||
          (await getTranslationString("ERRORS_SMARTTRANSLATE_APPLY_FAILED")) ||
          "(خطایی در جایگذاری.)"
      );
    }

    logME("[SmartTranslateHandler] Fallback applied successfully");

    // فقط اگر fallback اجرا شد → کپی به حافظه
    try {
      await navigator.clipboard.writeText(translated);
      translationHandler.notifier.show(
        (await getTranslationString("STATUS_SMARTTRANSLATE_COPIED")) ||
          "ترجمه در حافظه کپی شد. (Ctrl+V)",
        "success",
        true,
        3000
      );
    } catch (error) {
      await translationHandler.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "smartTranslation-clipboard",
      });
    }
  } catch (err) {
    await translationHandler.errorHandler.handle(err, {
      type: ErrorTypes.API,
      context: "smartTranslate-handler-main-second",
    });
  }
}
