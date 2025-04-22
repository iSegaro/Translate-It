import { getDebugModeAsync, CONFIG } from "../config.js";
import NotificationManager from "../managers/NotificationManager.js";
import { logME, openOptionsPage } from "../utils/helpers.js";
import { matchErrorToType } from "./ErrorMatcher.js";
import { getErrorMessage } from "./ErrorMessages.js";
import { ErrorTypes } from "./ErrorTypes.js";

const SILENT = new Set([ErrorTypes.CONTEXT]);
const SUPPRESS_CONSOLE = new Set([
  ErrorTypes.CONTEXT,
  ErrorTypes.API,
  ErrorTypes.API_KEY_INVALID,
  ErrorTypes.API_KEY_MISSING,
  ErrorTypes.API_URL_MISSING,
  ErrorTypes.MODEL_MISSING,
  ErrorTypes.QUOTA_EXCEEDED,
  ErrorTypes.NETWORK,
  ErrorTypes.INTEGRATION,
  ErrorTypes.SERVICE,
  ErrorTypes.VALIDATION,
  ErrorTypes.UI,
  ErrorTypes.PROMPT_INVALID,
  ErrorTypes.TEXT_EMPTY,
  ErrorTypes.TEXT_TOO_LONG,
  ErrorTypes.TRANSLATION_NOT_FOUND,
  ErrorTypes.TRANSLATION_FAILED,
  ErrorTypes.TAB_AVAILABILITY,
]);
const OPEN_SETTINGS = new Set([
  ErrorTypes.API_KEY_INVALID,
  ErrorTypes.API_KEY_MISSING,
  ErrorTypes.MODEL_MISSING,
  ErrorTypes.API_URL_MISSING,
  ErrorTypes.QUOTA_EXCEEDED,
  ErrorTypes.GEMINI_QUOTA,
]);

export class ErrorHandler {
  constructor() {
    this.notifier = new NotificationManager();
    this.shown = new Set();
    this.handling = false;
  }
  static async processError(err) {
    return err?.then ? await err : err;
  }
  async handle(err, meta = {}) {
    if (this.handling) return err;
    this.handling = true;
    try {
      const raw = err instanceof Error ? err.message : String(err);
      const type = matchErrorToType(raw);
      const msg = await getErrorMessage(type);
      const debug = await getDebugModeAsync().catch(() => CONFIG.DEBUG_MODE);
      if (debug && !SUPPRESS_CONSOLE.has(type)) {
        console.error(`[${type}] ${raw}`, err.stack);
      }
      if (SILENT.has(type)) return err;
      const action = OPEN_SETTINGS.has(type) ? openOptionsPage : undefined;
      if (!this.shown.has(msg)) {
        this.notifier.show(
          msg,
          type === ErrorTypes.NETWORK ? "warning" : "error",
          true,
          4000,
          action
        );
        this.shown.add(msg);
        setTimeout(() => this.shown.delete(msg), 4500);
      }
      return err;
    } finally {
      this.handling = false;
    }
  }

  async handle_OLD(error, meta = {}) {
    if (error?._isHandled) return error;
    if (this.isHandling) return error;
    this.isHandling = true;

    try {
      const normalized = await extractError(error);
      const key = normalized._errorKey;
      const code = key.toUpperCase();

      const isDebug = await getDebugModeAsync().catch(() => CONFIG.DEBUG_MODE);
      const shouldLog = isDebug && !SUPPRESS_CONSOLE_LOG_ERRORS.has(code);
      if (shouldLog) {
        this._logError(normalized, meta);
      }

      if (SILENT_ERRORS.has(code)) {
        normalized._isHandled = true;
        return normalized;
      }

      // prepare user message and optional action
      const userMsg = await getErrorMessageByKey(key);
      let action;
      if (OPEN_SETTINGS_ERRORS.has(code)) {
        action = () => openOptionsPage();
      }

      this._notifyUser(userMsg, meta.type || ErrorTypes.SERVICE, action);
      normalized._isHandled = true;
      return normalized;
    } catch (fatal) {
      logME("[ErrorService] Fatal error in handler:", fatal);
      return fatal;
    } finally {
      this.isHandling = false;
    }
  }

  _logError(error, meta) {
    console.error(
      `[ErrorService] ${error.name}: ${error.message}\nContext: ${meta.context}\nType: ${meta.type}\nStack: ${error.stack}`
    );
  }

  _notifyUser(message, type, action) {
    if (this.displayedErrors.has(message)) return;
    const typeMap = {
      [ErrorTypes.API]: "error",
      [ErrorTypes.UI]: "error",
      [ErrorTypes.NETWORK]: "warning",
      [ErrorTypes.SERVICE]: "error",
      [ErrorTypes.CONTEXT]: "warning",
      [ErrorTypes.VALIDATION]: "warning",
      [ErrorTypes.INTEGRATION]: "warning",
    };
    const toastType = typeMap[type] || "error";
    this.notifier.show(message, toastType, true, 4000, action);
    this.displayedErrors.add(message);
    setTimeout(() => this.displayedErrors.delete(message), 4500);
  }
}

export async function handleUIError(err, context = "") {
  const handler = new ErrorHandler();
  return handler.handle(err, { type: ErrorTypes.UI, context });
}
