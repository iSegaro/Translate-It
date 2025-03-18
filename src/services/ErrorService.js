// src/services/ErrorService.js
import { TRANSLATION_ERRORS, CONFIG } from "../config.js";
import NotificationManager from "../managers/NotificationManager.js";

export class ErrorTypes {
  static API = "API";
  static NETWORK = "NETWORK";
  static SERVICE = "SERVICE";
  static VALIDATION = "VALIDATION";
  static CONTEXT = "CONTEXT";
  static UI = "UI";
}

export class ErrorHandler {
  constructor(notificationManager = new NotificationManager()) {
    this.notifier = notificationManager;
    this.displayedErrors = new Set();
  }

  handle(error, meta = {}) {
    // نرمال‌سازی خطا در صورتی که از نوع Error نباشد
    if (!(error instanceof Error)) {
      error = new Error(String(error));
    }
    const { type, statusCode, element } = meta;
    const message = this._getErrorMessage(error, type, statusCode);

    this._logError(error, meta);
    this._notifyUser(message, type, element);

    return error;
  }

  _getErrorMessage(error, type, statusCode) {
    const errorMap = {
      [ErrorTypes.API]: {
        401: TRANSLATION_ERRORS.MISSING_API_KEY,
        403: "کلید API نامعتبر است",
        429: TRANSLATION_ERRORS.SERVICE_OVERLOADED,
        500: "خطای داخلی سرور",
        default: "خطای سرویس API",
      },
      [ErrorTypes.NETWORK]: {
        default: TRANSLATION_ERRORS.NETWORK_FAILURE,
      },
      [ErrorTypes.SERVICE]: {
        503: "سرویس موقتاً در دسترس نیست",
        default: "خطای سرویس ترجمه",
      },
      [ErrorTypes.CONTEXT]: {
        default: TRANSLATION_ERRORS.INVALID_CONTEXT,
      },
      [ErrorTypes.UI]: {
        default: "خطای سیستمی رخ داده است",
      },
      [ErrorTypes.VALIDATION]: {
        default: "خطای اعتبارسنجی رخ داده است",
      },
    };

    if (type && errorMap[type]) {
      return errorMap[type][statusCode] || errorMap[type].default;
    }

    // در صورت نداشتن نوع مشخص از پیام اصلی خطا استفاده می‌شود
    return error.message || "خطای ناشناخته رخ داده است";
  }

  _logError(error, meta) {
    // چاپ نام و پیام خطا به همراه متادیتا و استک (در صورت وجود) برای دیباگ
    console.error(`[ErrorHandler] ${error.name}: ${error.message}`, meta);
    if (error.stack) {
      console.error(error.stack);
    }
  }

  _notifyUser(message, type, element) {
    // جلوگیری از نمایش خطاهای تکراری به مدت زمان مشخص
    if (this.displayedErrors.has(message)) return;

    const notificationType = this._getNotificationType(type);
    this.notifier.show(message, notificationType, true, 5000);
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
      [ErrorTypes.VALIDATION]: "warning",
    };

    return typeMap[errorType] || "error";
  }
}
