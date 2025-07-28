// src/handlers/smartTranslationIntegration.js

// Description: This file contains the background handlers for the extension.
// It includes functions to handle translation requests, revert translations, and manage errors.
//       type: ErrorTypes.UI,
//         context: "IconManager-createTranslateIcon",
//       });
//       return null;
//     }
//   }
// It also includes functions to copy translations to the clipboard and manage notifications.

import { smartTranslate } from "../backgrounds/bridgeIntegration.js";
import {
  TranslationMode,
  getREPLACE_SPECIAL_SITESAsync,
  getCOPY_REPLACEAsync,
} from "../config.js";
import { detectPlatform, Platform } from "../utils/platformDetector.js";
import { getTranslationString } from "../utils/i18n.js";
import { logME } from "../utils/helpers.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { isComplexEditor } from "../utils/framework-compat/index.js";

/**
 * بررسی اینکه آیا متنی در المان فعال انتخاب شده است یا نه
 */
function hasActiveElementTextSelection() {
  try {
    const activeElement = document.activeElement;
    if (!activeElement) return false;

    if (activeElement.isContentEditable) {
      const selection = window.getSelection();
      return selection && !selection.isCollapsed && selection.toString().trim().length > 0;
    } else if (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA") {
      return activeElement.selectionStart !== activeElement.selectionEnd;
    }

    return false;
  } catch (error) {
    logME("[SmartTranslationHandler] Error checking text selection:", error);
    return false;
  }
}

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

    // تعیین حالت عملیات: جایگزینی یا کپی
    let isReplaceMode = false;
    
    const hasTextSelection = hasActiveElementTextSelection();
    
    if (mode === TranslationMode.Field) {
      // بررسی تنظیمات کلی
      const is_copy = await getCOPY_REPLACEAsync();
      
      if (platform === Platform.Default) {
        // فقط برای platform پیش‌فرض، بررسی ویرایشگر پیچیده
        const activeElement = document.activeElement;
        const isComplexEditorDetected = activeElement ? isComplexEditor(activeElement) : false;
        
        if (isComplexEditorDetected) {
          // اگر کاربر صریحاً replace mode انتخاب کرده، به آن احترام بگذاریم
          // سیستم universalTextInsertion جدید ما می‌تواند با complex editors کار کند
          if (is_copy === "replace") {
            logME("[SmartTranslationHandler] Complex editor detected but user chose replace mode - attempting advanced insertion");
            isReplaceMode = true;
          } else {
            logME("[SmartTranslationHandler] Complex editor detected with copy mode - forcing copy mode");
            isReplaceMode = false;
          }
        } else if (is_copy === "replace") {
          isReplaceMode = true;
          logME(`[SmartTranslationHandler] replace on default (hasSelection: ${hasTextSelection})`);
        } else {
          logME(`[SmartTranslationHandler] copy on default (hasSelection: ${hasTextSelection})`);
        }
      } else {
        // برای platform‌های خاص، از استراتژی موجود استفاده کن
        if (is_copy === "replace") {
          isReplaceMode = true;
          logME(`[SmartTranslationHandler] replace on platform (hasSelection: ${hasTextSelection})`);
        } else {
          const is_special_replace = await getREPLACE_SPECIAL_SITESAsync();
          logME(`REPLACE_SPECIAL_SITES ${is_special_replace} (hasSelection: ${hasTextSelection})`);
          if (is_special_replace === true) {
            isReplaceMode = true;
          }
        }
      }
    } else if (mode === TranslationMode.SelectElement) {
      isReplaceMode = true; // در حالت انتخاب المنت، همیشه جایگزین می‌کنیم
      logME("TranslationMode.SelectElement: isReplaceMode is always true");
    }

    // --- شروع منطق جایگزینی یا کپی ---

    if (isReplaceMode) {
      logME("[SmartTranslateHandler] Attempting Replace Mode...");

      let wasAppliedSuccessfully = false;

      // تلاش برای جایگزینی از طریق استراتژی‌های مستقیم (اگر وجود داشته باشد)
      // این بخش بیشتر برای حالتی است که target یک شیء قابل کنترل در همین کانتکست باشد
      if (
        selectionRange &&
        translationHandler.strategies[platform]?.updateElement
      ) {
        wasAppliedSuccessfully = await translationHandler.strategies[
          platform
        ].updateElement(selectionRange, translated);
      } else if (target && !selectionRange) {
        // این متد در service worker به DOM دسترسی ندارد اما برای سناریوهای خاص شاید پیاده‌سازی شده باشد
        wasAppliedSuccessfully = await translationHandler.updateTargetElement(
          target,
          translated
        );
      }

      // اگر استراتژی مستقیم موفق نبود، از طریق ارسال پیام به Content Script تلاش می‌کنیم
      if (!wasAppliedSuccessfully) {
        logME(
          "[SmartTranslateHandler] Direct strategy failed or skipped. Fallback to message passing."
        );

        try {
          const res = await browser.runtime.sendMessage({
            action: "applyTranslationToActiveElement",
            payload: { translatedText: translated, copyOnly: false },
          });

          // پاسخ از contentMain.js را بررسی می‌کنیم
          wasAppliedSuccessfully =
            res === true || (res && res.success === true);

          if (!wasAppliedSuccessfully) {
            logME(
              "[SmartTranslateHandler] ❗ Fallback via sendMessage also failed.",
              res?.error || ""
            );
          } else {
            logME(
              "[SmartTranslateHandler] Fallback via sendMessage applied successfully."
            );
          }
        } catch (err) {
          logME(
            "[SmartTranslateHandler] ❗ Error during sendMessage for applyTranslation.",
            err
          );
          wasAppliedSuccessfully = false;
        }
      } else {
        logME("[SmartTranslateHandler] Direct strategy applied successfully.");
      }

      // اگر هیچ‌کدام از روش‌های جایگزینی موفق نبود، متن را در کلیپ‌بورد کپی می‌کنیم
      if (!wasAppliedSuccessfully) {
        logME(
          "[SmartTranslateHandler] All replace attempts failed. Final fallback: Copying to clipboard."
        );
        await copyToClipboard(translated, translationHandler);
      }
    } else {
      // --- حالت کپی فعال است ---
      logME("[SmartTranslateHandler] Executing Copy Mode - no field modifications.");
      await copyToClipboard(translated, translationHandler);
    }
  } catch (err) {
    await translationHandler.errorHandler.handle(err, {
      type: err.type || ErrorTypes.API,
      context: "smartTranslate-handler-main-catch-all",
    });
  }
}

// تابع کمکی برای جلوگیری از تکرار کد کپی
async function copyToClipboard(text, translationHandler) {
  try {
    await navigator.clipboard.writeText(text);
    translationHandler.notifier.show(
      (await getTranslationString("STATUS_SMART_TRANSLATE_COPIED")) ||
        "ترجمه در حافظه کپی شد. (Ctrl+V)",
      "success",
      true,
      3000
    );
  } catch (error) {
    await translationHandler.errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "smartTranslation-clipboard-helper",
    });
  }
}
