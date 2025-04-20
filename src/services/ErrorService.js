// src/services/ErrorService.js
import Browser from "webextension-polyfill";
import { TRANSLATION_ERRORS, CONFIG, getDebugModeAsync } from "../config.js";
import NotificationManager from "../managers/NotificationManager.js";
import { logME, openOptionsPage } from "../utils/helpers.js";
import { getErrorMessage } from "./ErrorMessagesService";
import { translateErrorMessage } from "./ErrorTranslationService.js";

export class ErrorTypes {
  static API = "API";
  static NETWORK = "NETWORK";
  static SERVICE = "SERVICE";
  static VALIDATIONMODEL = "VALIDATIONMODEL";
  static CONTEXT = "CONTEXT";
  static UI = "UI";
  static INTEGRATION = "INTEGRATION";
  static PARSE_SELECT_ELEMENT = "PARSING_RESPONSE";
  static PARSE_INPUT = "PARSING_EXTRACT_FIELD";
}

async function extractErrorMessage(error) {
  if (!error) return "(Unknown Error)";

  // استخراج پیام اولیه
  let rawMessage =
    typeof error === "string" ? error
    : error instanceof Error ? error.message
    : typeof error.message === "string" ? error.message
    : (() => {
        try {
          return JSON.stringify(error);
        } catch {
          return "(Unknown Error)";
        }
      })();

  // ✅ ترجمه خطا
  const translated = await translateErrorMessage(rawMessage);
  return translated || rawMessage;
}

export class ErrorHandler {
  constructor(notificationManager = new NotificationManager()) {
    this.notifier = notificationManager;
    this.displayedErrors = new Set();
    this.isHandling = false;
    // خطاهایی که نیاز به نمایش یا لاگ کردن آن‌ها نداریم
    this.suppressed_Errors = new Set([
      "invalid-protocol",
      "invalid-tab",
      "text-direction-error",
      "promise-rejection-in-translateText",
      "promise-error-in-translateText",
      "parsing-response-error",
      // "context-invalid",
      "api-error-response",
    ]);
    this.suppressed_ErrorsConsole = new Set([
      "invalid-protocol",
      "invalid-tab",
      "icon-position-error",
      "icon-creation-error",
      "text-direction-error",
      "promise-rejection-in-translateText",
      "promise-error-in-translateText",
      // "context-invalid",
      "api-error-response",
    ]);
  }

  static async processError(error) {
    if (typeof error.then === "function") {
      error = await error;
    }
    return error;
  }

  async handle(error, customMeta = {}) {
    if (error?._isHandled) {
      logME("[ErrorService] Skipping already-handled error.");
      return error;
    }
    // اگر error یک Promise باشد، منتظر تکمیل آن شود (resolve یا reject)
    if (typeof error.then === "function") {
      error = await error;
    }

    // if (this.isHandling || this.displayedErrors.has(error.message)) {
    if (this.isHandling) {
      logME("[ErrorService] Ignoring duplicate error:", error);
      return error;
    }
    this.isHandling = true;
    // Add the error message to the set to prevent duplicate notifications
    this.displayedErrors.add(error.message);

    try {
      // نرمال‌سازی خطا
      const rawTranslated = await extractErrorMessage(error);
      const normalizedError =
        error instanceof Error ? error : new Error(rawTranslated);

      // ادغام متادیتاها
      const mergedMeta = {
        ...(normalizedError.meta || {}),
        ...customMeta,
        type: customMeta.type || normalizedError.type || ErrorTypes.SERVICE,
        statusCode: normalizedError.statusCode || customMeta.statusCode || 500,
      };

      // تعیین نهایی نوع خطا
      mergedMeta.type = this._reviewErrorType(
        normalizedError,
        mergedMeta.type,
        mergedMeta
      );

      // تولید پیام خطا
      const { message, code } = await this._getErrorMessage(
        normalizedError,
        mergedMeta.type,
        mergedMeta.statusCode,
        mergedMeta
      );

      // بررسی حالت دیباگ
      const isDebugMode = await getDebugModeAsync().catch(
        () => CONFIG.DEBUG_MODE
      );

      // ثبت خطا در کنسول
      this._logError(normalizedError, mergedMeta, code, isDebugMode);

      // نمایش پیام به کاربر
      this._notifyUser(message, mergedMeta.type, code);

      // در صورت خطای CONTEXT، ریلود مرکزی انجام شود
      if (mergedMeta.type === ErrorTypes.CONTEXT && !this.reloadScheduled) {
        this._contextInvalidated();
      }

      // علامت‌گذاری خطا به عنوان هندل شده
      normalizedError._isHandled = true;
      return normalizedError;
    } catch (finalError) {
      logME("[ErrorService] Critical Unknown Error:", finalError);
      return finalError;
    } finally {
      this.isHandling = false;
    }
  }

  _contextInvalidated() {
    this.reloadScheduled = true;
    // پیام Context Invalid به کاربر نمایش داده شده؛ حالا پس از 2000 میلی‌ثانیه اکستنشن ریلود شود.
    if (Browser.runtime && Browser.runtime.sendMessage) {
      setTimeout(() => {
        try {
          Browser.runtime.sendMessage({ action: "restart_content_script" });
        } catch (e) {
          if (e.message?.includes("context invalidated")) {
            // logME("[ErrorService] Extension context invalidated");
          } else {
            logME("[ErrorService] Cannot send restart message.");
          }
        }
      }, 2000);
    } else {
      logME(
        "[ErrorService] Extension context invalid, cannot send restart message."
      );
    }
  }

  _reviewErrorType(error, currentType, meta) {
    let type = currentType;
    logME("[ErrorService] Reviewing error type:", error.message);

    // بررسی خطاهای مربوط به API Key
    if (
      error.message.includes("API key") ||
      error.message.includes("API_KEY") ||
      error.message === TRANSLATION_ERRORS.MISSING_API_KEY
    ) {
      type = ErrorTypes.API;
    }

    // بررسی خطاهای مربوط به Context
    if (
      error.message.includes("context invalidated") ||
      error.message.includes("Extension context invalid")
    ) {
      type = ErrorTypes.CONTEXT;
      error.code = "context-invalidated";
    }

    // بررسی خطاهای Integration در شرایط خاص
    if (
      error.message.includes("reading 'handle'") &&
      meta.context === "ctrl-slash"
    ) {
      type = ErrorTypes.INTEGRATION;
    }

    // بررسی خطاهای شبکه
    if (error.message.includes("Failed to fetch")) {
      type = ErrorTypes.NETWORK;
    }

    return type;
  }

  async _getErrorMessage(error, type, statusCode, meta) {
    logME("[ErrorService] getErrorMessage => ", error);

    if (meta.suppressSystemError) {
      return { code: "suppressed-error", message: "" };
    }
    if (meta.suppressSecondary) {
      return { code: "suppressed", message: "" };
    }

    const errorMap = {
      [ErrorTypes.API]: {
        400: {
          code: "api-key-wrong",
          message: await getErrorMessage("ERRORS_API_KEY_WRONG"),
        },
        401: {
          code: "api-key-unauthorized",
          message: await getErrorMessage("ERRORS_API_KEY_ISSUE"),
        },
        601: {
          code: "api-key-missing",
          message: await getErrorMessage("ERRORS_API_KEY_MISSING"),
        },
        403: {
          code: "api-forbidden",
          message: await getErrorMessage("ERRORS_API_KEY_FORBIDDEN"),
        },
        604: {
          code: "api-url-missing",
          message: await getErrorMessage("ERRORS_API_URL_MISSING"),
        },
        605: {
          code: "api-model-missing",
          message: await getErrorMessage("ERRORS_AI_MODEL_MISSING"),
        },
        429: {
          code: "service-overloaded",
          message: await getErrorMessage("ERRORS_SERVICE_OVERLOADED"),
        },
        default: {
          code: "api-error-response",
          message: await getErrorMessage("ERRORS_INVALID_RESPONSE"),
        },
      },
      [ErrorTypes.NETWORK]: {
        default: {
          code: "network-failure",
          message: await getErrorMessage("ERRORS_NETWORK_FAILURE"),
        },
      },
      [ErrorTypes.CONTEXT]: {
        default: {
          code: "context-lost",
          message: await getErrorMessage("ERRORS_CONTEXT_LOST"),
        },
      },
      [ErrorTypes.UI]: {
        "text-direction-error": {
          code: "text-direction-error",
          message: "خطا در تنظیم جهت متن",
        },
        default: { code: "system-error", message: "خطای سیستمی رخ داده است" },
      },
      [ErrorTypes.VALIDATIONMODEL]: {
        default: {
          code: "model-validation-error",
          message: "خطا در مدلِ انتخاب شده",
        },
      },
      [ErrorTypes.PARSE_SELECT_ELEMENT]: {
        default: {
          code: "parsing-response-error",
          message: "خطا در پردازش پاسخ",
        },
      },
      [ErrorTypes.INTEGRATION]: {
        "ctrl-slash": {
          code: "shortcut-connection-error",
          message: "⚠️ خطا در اتصال شورتکات به صفحه",
        },
        "invalid-tab": {
          code: "invalid-tab",
          message: "⚠️ تب جاری معتبر نیست",
        },
        "invalid-protocol": {
          code: "invalid-protocol",
          message:
            "❌ این قابلیت فقط در آدرس‌های وب معمولی (http/https) کار می‌کند",
        },
        "content-injection-error": {
          code: "content-injection-error",
          message: "⚠️ خطا در تزریق کد به صفحه",
        },
        "api-unavailable": {
          code: "api-unavailable",
          message:
            "امکانات ضروری افزونه در دسترس نیستند. لطفا مرورگر را آپدیت کنید.",
        },
        default: {
          code: "integration-error",
          message: "⚠️ خطا در اتصال به این صفحه",
        },
      },
    };

    const effectiveStatusCode = meta.statusCode || statusCode;
    if (type === ErrorTypes.API) {
      return (
        errorMap[ErrorTypes.API][effectiveStatusCode] ||
        errorMap[ErrorTypes.API].default
      );
    }

    let messageObject = {
      code: "unknown-error",
      message: "خطای ناشناخته رخ داده است",
    };
    if (type && errorMap[type]) {
      const typeErrors = errorMap[type];
      if (statusCode && typeErrors[statusCode]) {
        messageObject = typeErrors[statusCode];
      } else if (type === ErrorTypes.INTEGRATION) {
        const errorKey = Object.keys(typeErrors).find(
          (key) => error.message.includes(key) || meta.context === key
        );
        messageObject = errorKey ? typeErrors[errorKey] : typeErrors.default;
      } else {
        messageObject = typeErrors.default || messageObject;
      }
    }
    return messageObject;
  }

  _logError(error, meta, errorCode, isDebugMode) {
    if (this.suppressed_ErrorsConsole.has(errorCode)) {
      return;
    }
    if (meta.type === ErrorTypes.CONTEXT) {
      return;
    }

    const errorDetails = {
      name: error.name,
      message: error.message,
      type: meta.type,
      statusCode: meta.statusCode,
      context: meta.context,
      stack: error.stack,
    };
    if (isDebugMode) {
      console.error(`[ErrorService] ${errorDetails.name}: ${errorDetails.message}
Type: ${errorDetails.type}
Status: ${errorDetails.statusCode}
Context: ${errorDetails.context}`);
      if (error.stack)
        console.error("[ErrorService] Stack Trace:", error.stack);
    } else {
      logME(`[ErrorHandler] ${errorDetails.name}: ${errorDetails.message}
Type: ${errorDetails.type}
Status: ${errorDetails.statusCode}
Context: ${errorDetails.context}`);
      if (error.stack) logME("[ErrorService] Stack Trace:", error.stack);
    }
  }

  _notifyUser(message, type, errorCode) {
    logME("[ErrorService] Showing notification for error", message);
    if (errorCode === "suppressed" || errorCode === "suppressed-error") return;
    if (
      this.suppressed_Errors.has(errorCode) ||
      this.displayedErrors.has(message)
    ) {
      logME("[ErrorService] Silent Error. Don't need to show notification.");
      return;
    }

    const notificationType = this._getNotificationType(type);

    // تعریف مجموعه خطاهایی که نیاز به ارسال openOptionsPage دارند
    const errorsWithOptions = new Set([
      "api-key-wrong", // برای خطای 400
      "api-key-missing", // برای خطای 601
      "api-url-missing", // برای خطای 604
    ]);

    if (type === ErrorTypes.API && errorsWithOptions.has(errorCode)) {
      this.notifier.show(
        message,
        notificationType,
        true,
        5000,
        openOptionsPage
      );
    } else {
      this.notifier.show(message, notificationType, true, 5000);
    }

    this.displayedErrors.add(message);
    setTimeout(() => this.displayedErrors.delete(message), 5000);
  }

  _getNotificationType(errorType) {
    const typeMap = {
      [ErrorTypes.UI]: "error",
      [ErrorTypes.API]: "error",
      [ErrorTypes.NETWORK]: "warning",
      [ErrorTypes.SERVICE]: "error",
      [ErrorTypes.CONTEXT]: "warning",
      [ErrorTypes.VALIDATIONMODEL]: "warning",
      [ErrorTypes.INTEGRATION]: "warning",
    };
    return typeMap[errorType] || "error";
  }
}

export async function handleUIError(error, context = "") {
  const handler = new ErrorHandler();
  return await handler.handle(error, {
    type: ErrorTypes.UI,
    context,
  });
}
