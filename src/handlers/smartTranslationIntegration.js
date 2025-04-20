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

    // ✅ بررسی خطای مستقیم از پاسخ API (مانند missing API Key)
    if (response?.success === false) {
      const msg = response?.error || "(خطایی رخ داد)";

      const err = new Error(msg);
      await translationHandler.errorHandler.handle(err, {
        type: ErrorTypes.API,
        context: "smartTranslate-response-handler",
        statusCode: response?.statusCode || 400,
        isPrimary: true,
      });

      return; // جلوگیری از ادامه fallback
    }

    translated =
      response?.data?.translatedText ??
      response?.translatedText ??
      response?.result?.data?.translatedText ??
      response?.result?.translatedText;

    if (typeof translated === "string") {
      translated = translated.trim();
    }

    if (!translated) {
      await translationHandler.errorHandler.handle(
        Error("(Translation not found)"),
        {
          type: ErrorTypes.API,
          context: "smartTranslate-handler-main",
          isPrimary: true,
        }
      );
      return;
    }

    let previousValue = "";
    if (target?.isContentEditable) {
      previousValue = target.innerText?.trim();
    } else if (target && "value" in target) {
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

    const newValue =
      target?.isContentEditable ? target.innerText?.trim()
      : target && "value" in target ? target.value?.trim()
      : null;

    const updated = newValue !== null && newValue === translated;

    if (updated) {
      return;
    }

    logME(
      "[SmartTranslateHandler] Update skipped or blocked, falling back to bridge"
    );
  } catch (error) {
    await translationHandler.errorHandler.handle(error, {
      type: ErrorTypes.API,
      context: "smartTranslate-handler-main",
      isPrimary: true,
    });
    return;
  }

  // ✅ fallback فقط اگر بالایی موفق نبود
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
      throw new Error(
        res?.error ||
          (await getTranslationString("ERRORS_SMARTTRANSLATE_APPLY_FAILED")) ||
          "(خطایی در جایگذاری.)"
      );
    }

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

    logME("[SmartTranslateHandler] Translation applied via fallback bridge.");
  } catch (fallbackErr) {
    await translationHandler.errorHandler.handle(fallbackErr, {
      type: ErrorTypes.API,
      context: "smartTranslate-fallback-handler",
    });
  }
}
