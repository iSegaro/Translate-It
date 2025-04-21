// src/services/ErrorService.js

import { CONFIG, getDebugModeAsync } from "../config.js";
import NotificationManager from "../managers/NotificationManager.js";
import { logME, openOptionsPage } from "../utils/helpers.js";
import { matchErrorToKey } from "./ErrorMessages.js";
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

const SILENT_ERRORS = new Set(["ERRORS_CONTEXT_LOST"]);

const SUPPRESS_CONSOLE_LOG_ERRORS = new Set([
  "ERRORS_CONTEXT_LOST",
  "ERRORS_API_KEY_WRONG",
  "ERRORS_API_KEY_MISSING",
  "ERRORS_MODEL_MISSING",
  "ERRORS_QUOTA_EXCEEDED",
  "ERRORS_API_URL_MISSING",
  "ERRORS_API_KEY_FORBIDDEN",
  "ERRORS_GEMINI_GENERATE_QUOTA",
]);

export async function extractError(error) {
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

  const errorKey = matchErrorToKey(raw);
  const translated = errorKey ? await getTranslationString(errorKey) : null;

  const wrapped = new Error(translated || raw);
  wrapped._originalMessage = raw;
  wrapped._errorKey = errorKey || null;
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

      const mergedMeta = {
        ...(normalizedError.meta || {}),
        ...meta,
        type: meta.type || ErrorTypes.SERVICE,
        statusCode: meta.statusCode || 500,
        context: meta.context || "",
      };

      const errorKey = normalizedError._errorKey;
      const errorCode = errorKey ? errorKey.toUpperCase() : "UNKNOWN-ERROR";

      const isDebugMode = await getDebugModeAsync().catch(
        () => CONFIG.DEBUG_MODE
      );

      const shouldLogToConsole =
        isDebugMode && !SUPPRESS_CONSOLE_LOG_ERRORS.has(errorCode);

      if (shouldLogToConsole) {
        this._logError(normalizedError, mergedMeta);
      }

      if (SILENT_ERRORS.has(errorCode)) {
        normalizedError._isHandled = true;
        return normalizedError;
      }

      const finalMessage =
        errorKey ?
          await getTranslationString(errorKey)
        : normalizedError.message;

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
      "ERRORS_API_KEY_WRONG",
      "ERRORS_API_KEY_MISSING",
      "ERRORS_API_KEY_FORBIDDEN",
      "ERRORS_API_URL_MISSING",
      "ERRORS_MODEL_MISSING",
      "ERRORS_QUOTA_EXCEEDED",
      "ERRORS_GEMINI_GENERATE_QUOTA",
    ]);

    const action =
      type === ErrorTypes.API && openSettingsErrors.has(errorCode) ?
        openOptionsPage
      : undefined;

    this.notifier.show(message, notificationType, true, 4000, action);
    this.displayedErrors.add(message);
    setTimeout(() => this.displayedErrors.delete(message), 4000);
  }
}

export async function handleUIError(error, context = "") {
  const handler = new ErrorHandler();
  return await handler.handle(error, {
    type: ErrorTypes.UI,
    context,
  });
}
