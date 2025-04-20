// src/services/ErrorService.js

import { CONFIG, getDebugModeAsync } from "../config.js";
import NotificationManager from "../managers/NotificationManager.js";
import { logME, openOptionsPage } from "../utils/helpers.js";
import {
  translateErrorMessage,
  matchErrorToKey,
} from "./ErrorTranslationError.js";
import { getTranslationString } from "../utils/i18n.js";

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

async function extractError(error) {
  if (!error) return new Error("(Unknown Error)");

  let raw =
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

  const translated = await translateErrorMessage(raw);
  const wrapped = new Error(translated || raw);
  wrapped._originalMessage = raw;
  return wrapped;
}

export class ErrorHandler {
  constructor(notificationManager = new NotificationManager()) {
    this.notifier = notificationManager;
    this.displayedErrors = new Set();
    this.isHandling = false;
  }

  static async processError(error) {
    if (typeof error?.then === "function") return await error;
    return error;
  }

  async handle(error, meta = {}) {
    if (error?._isHandled) return error;
    if (typeof error?.then === "function") error = await error;
    if (this.isHandling) return error;

    this.isHandling = true;

    try {
      const normalizedError = await extractError(error);
      const raw = normalizedError._originalMessage || normalizedError.message;

      const mergedMeta = {
        ...(normalizedError.meta || {}),
        ...meta,
        type: meta.type || ErrorTypes.SERVICE,
        statusCode: meta.statusCode || 500,
        context: meta.context || "",
      };

      const errorKey = matchErrorToKey(raw);
      const errorCode = errorKey ? errorKey.toLowerCase() : "unknown-error";

      const finalMessage =
        errorKey ?
          await getTranslationString(errorKey)
        : normalizedError.message;

      const isDebugMode = await getDebugModeAsync().catch(
        () => CONFIG.DEBUG_MODE
      );

      if (errorCode === "unknown-error" && isDebugMode) {
        this._logError(normalizedError, mergedMeta);
      }

      this._notifyUser(finalMessage, mergedMeta.type, errorCode);
      normalizedError._isHandled = true;
      return normalizedError;
    } catch (finalError) {
      logME("[ErrorService] Critical error:", finalError);
      return finalError;
    } finally {
      this.isHandling = false;
    }
  }

  _logError(error, meta) {
    const details = {
      name: error.name,
      message: error.message,
      type: meta.type,
      statusCode: meta.statusCode,
      context: meta.context,
      stack: error.stack,
    };

    console.error(
      `[ErrorService] ${details.name}: ${details.message}\nType: ${details.type}\nStatus: ${details.statusCode}\nContext: ${details.context}`
    );
    if (details.stack) console.error("[Stack Trace]", details.stack);
  }

  _notifyUser(message, type, errorCode) {
    if (this.displayedErrors.has(message)) return;

    const typeMap = {
      [ErrorTypes.API]: "error",
      [ErrorTypes.UI]: "error",
      [ErrorTypes.NETWORK]: "warning",
      [ErrorTypes.SERVICE]: "error",
      [ErrorTypes.CONTEXT]: "warning",
      [ErrorTypes.VALIDATIONMODEL]: "warning",
      [ErrorTypes.INTEGRATION]: "warning",
    };

    const notificationType = typeMap[type] || "error";

    const openSettingsErrors = new Set([
      "errors_api_key_wrong",
      "errors_api_key_missing",
      "errors_api_url_missing",
    ]);

    const action =
      type === ErrorTypes.API && openSettingsErrors.has(errorCode) ?
        openOptionsPage
      : undefined;

    this.notifier.show(message, notificationType, true, 5000, action);
    this.displayedErrors.add(message);
    setTimeout(() => this.displayedErrors.delete(message), 5000);
  }
}

export async function handleUIError(error, context = "") {
  const handler = new ErrorHandler();
  return await handler.handle(error, {
    type: ErrorTypes.UI,
    context,
  });
}
