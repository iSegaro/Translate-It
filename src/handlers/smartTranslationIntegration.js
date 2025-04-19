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

  try {
    console.log("[SmartTranslateHandler] Injecting bridge (if needed)");
    injectPageBridge();

    console.log("[SmartTranslateHandler] Calling smartTranslate() with:", {
      text,
      mode,
    });

    const response = await smartTranslate(text, mode);

    console.log(
      "[SmartTranslateHandler] Response received from smartTranslate:",
      response
    );

    let translated =
      response?.data?.translatedText ??
      response?.translatedText ??
      response?.result?.data?.translatedText ??
      response?.result?.translatedText;

    if (typeof translated === "string") {
      translated = translated.trim();
    }

    if (!translated) {
      console.warn(
        "[SmartTranslateHandler] No valid translation found in response."
      );
      throw new Error("ترجمه اعمال نشد.");
    }

    console.log("[SmartTranslateHandler] Final translated text:", translated);

    // ✅ پلتفرم را تشخیص بده همیشه، چه restricted چه نه
    const platform =
      translationHandler.detectPlatform?.(target) ?? detectPlatform(target);
    console.log("[SmartTranslateHandler] Detected platform:", platform);

    // ✅ فقط در حالت restricted پیام بفرست، نه آپدیت مستقیم
    if (isRestrictedDomain()) {
      console.log(
        "[SmartTranslateHandler] Restricted domain → sending message only"
      );

      // ✅ اطمینان از focus بودن روی target
      if (target && typeof target.focus === "function") {
        console.log(
          "[SmartTranslateHandler] Focusing target before sending message"
        );
        target.focus();
        await new Promise((r) => setTimeout(r, 20)); // کمی زمان برای sync
      }

      const res = await Browser.runtime.sendMessage({
        action: "applyTranslationToActiveElement",
        payload: {
          translatedText: translated,
        },
      });

      console.log(
        "[SmartTranslateHandler] applyTranslationToActiveElement response:",
        res
      );

      const isSuccess =
        res === true || (typeof res === "object" && res.success === true);

      if (!isSuccess) {
        throw new Error(res?.error || "ترجمه اعمال نشد.");
      }

      return;
    }

    // ✅ در حالت عادی (non-restricted)
    if (
      selectionRange &&
      translationHandler.strategies[platform]?.updateElement
    ) {
      console.log("[SmartTranslateHandler] Updating selected range");
      await translationHandler.strategies[platform].updateElement(
        selectionRange,
        translated
      );
    } else if (target) {
      console.log("[SmartTranslateHandler] Updating target element");
      await translationHandler.updateTargetElement(target, translated);
    }
  } catch (error) {
    console.error("[SmartTranslateHandler] Translation failed:", error);
    translationHandler.errorHandler.handle(error, {
      type: translationHandler.ErrorTypes.API,
      context: "smartTranslate-field-handler",
    });
  }
}
