// Description: This file contains the background handlers for the extension.
// It includes functions to handle translation requests, revert translations, and manage errors.
//       type: ErrorTypes.UI,
//         context: "IconManager-createTranslateIcon",
//       });
//       return null;
//     }
//   }
// It also includes functions to copy translations to the clipboard and manage notifications.

// src/handlers/smartTranslationIntegration.js

import {
  smartTranslate,
  injectPageBridge,
} from "../backgrounds/bridgeIntegration.js";
import { TranslationMode } from "../config.js";
import { detectPlatform } from "../utils/platformDetector.js";
import { getTranslationString } from "../utils/i18n.js";
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { ErrorTypes } from "../services/ErrorTypes.js";

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

  try {
    injectPageBridge();
    const response = await smartTranslate(text, mode);

    if (response?.success === false) {
      const err = new Error(response.error || ErrorTypes.API);
      err.type = ErrorTypes.API;
      await translationHandler.errorHandler.handle(err, {
        type: ErrorTypes.API,
        context: "smartTranslate-response-handler",
        statusCode: response.statusCode || 400,
        isPrimary: true,
      });
      return;
    }

    const translated = (
      response.data?.translatedText ??
      response.translatedText ??
      response.result?.data?.translatedText ??
      response.result?.translatedText ??
      ""
    ).trim();

    if (!translated) {
      const err = new Error(ErrorTypes.TRANSLATION_NOT_FOUND);
      err.type = ErrorTypes.API;
      await translationHandler.errorHandler.handle(err, {
        type: ErrorTypes.API,
        context: "smartTranslate-handler-main",
        isPrimary: true,
      });
      return;
    }

    // نگه داشتن مقدار قبل برای دیباگ
    const beforeValue =
      target?.isContentEditable ? target.innerText.trim()
      : target && "value" in target ? target.value.trim()
      : null;

    logME("[SmartTranslateHandler] Initial value:", beforeValue);

    // اعمال استراتژی پلتفرم
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

    const afterValue =
      target?.isContentEditable ? target.innerText.trim()
      : target && "value" in target ? target.value.trim()
      : null;

    if (didApply && beforeValue !== afterValue) {
      logME("[SmartTranslateHandler] Strategy applied successfully");
      return;
    }

    if (afterValue === translated) {
      logME("[SmartTranslateHandler] DOM already updated");
      return;
    }

    logME("[SmartTranslateHandler] ❗ Fallback to manual apply");

    const res = await Browser.runtime.sendMessage({
      action: "applyTranslationToActiveElement",
      payload: { translatedText: translated },
    });

    const isSuccess = res === true || (res && res.success === true);
    if (!isSuccess) {
      const err = new Error(res?.error || ErrorTypes.API_SERVICE);
      err.type = ErrorTypes.API;
      throw err;
    }

    logME("[SmartTranslateHandler] Fallback applied successfully");

    // کپی به کلیپ‌بورد در صورت نیاز
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
      type: err.type || ErrorTypes.API,
      context: "smartTranslate-handler-main-second",
    });
  }
}
