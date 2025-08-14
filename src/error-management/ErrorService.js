// File: src/error-management/ErrorService.js

import NotificationManager from "../managers/core/NotificationManager.js";
import { matchErrorToType } from "./ErrorMatcher.js";
import { getErrorMessage } from "./ErrorMessages.js";
import { ErrorTypes } from "./ErrorTypes.js";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'ErrorService');

const SILENT = new Set([
  ErrorTypes.CONTEXT,
  ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
]);
const SUPPRESS_CONSOLE = new Set([
  ErrorTypes.CONTEXT,
  ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
  ErrorTypes.API,
  ErrorTypes.API_KEY_INVALID,
  ErrorTypes.API_KEY_MISSING,
  ErrorTypes.API_URL_MISSING,
  ErrorTypes.MODEL_MISSING,
  ErrorTypes.MODEL_OVERLOADED,
  ErrorTypes.QUOTA_EXCEEDED,
  ErrorTypes.GEMINI_QUOTA_REGION,
  ErrorTypes.NETWORK_ERROR,
  ErrorTypes.HTTP_ERROR,
  ErrorTypes.INTEGRATION,
  ErrorTypes.SERVICE,
  ErrorTypes.VALIDATION,
  ErrorTypes.UI,
  ErrorTypes.PROMPT_INVALID,
  ErrorTypes.TEXT_EMPTY,
  ErrorTypes.TEXT_TOO_LONG,
  ErrorTypes.TRANSLATION_NOT_FOUND,
  ErrorTypes.TRANSLATION_FAILED,
  ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED,
  ErrorTypes.TAB_AVAILABILITY,
  ErrorTypes.IMPORT_PASSWORD_INCORRECT,
  ErrorTypes.IMPORT_PASSWORD_REQUIRED,
]);
const OPEN_SETTINGS = new Set([
  ErrorTypes.API_KEY_INVALID,
  ErrorTypes.API_KEY_MISSING,
  ErrorTypes.MODEL_OVERLOADED,
  ErrorTypes.MODEL_MISSING,
  ErrorTypes.API_URL_MISSING,
  ErrorTypes.QUOTA_EXCEEDED,
  ErrorTypes.HTTP_ERROR,
  ErrorTypes.GEMINI_QUOTA_REGION,
]);

let _instance = null; // Singleton instance

export class ErrorHandler {
  constructor() {
    if (_instance) {
      return _instance;
    }
    this.notifier = NotificationManager.getInstance(); // Get singleton instance
    this.displayedErrors = new Set();
    this.handling = false;
    this.openOptionsPageCallback = null; // Property to hold the callback
    this.debugMode = false; // Debug mode state
    _instance = this; // Set singleton instance
  }

  // Method to set the callback from outside
  setOpenOptionsPageCallback(callback) {
    this.openOptionsPageCallback = callback;
  }

  // Method to set debug mode
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  static getInstance() {
    if (!_instance) {
      _instance = new ErrorHandler();
    }
    return _instance;
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
      
      // Use instance debug mode instead of importing from config to avoid circular dependency
      if (this.debugMode && !SUPPRESS_CONSOLE.has(type)) {
        logger.error(`[${type}] ${raw}`, err.stack);
      }
      if (SILENT.has(type)) return err;

      // Use the stored callback
      const action =
        OPEN_SETTINGS.has(type) && this.openOptionsPageCallback
          ? () => this.openOptionsPageCallback("api")
          : undefined;

      this._notifyUser(msg, meta.type || ErrorTypes.SERVICE, action);
      return err;
    } finally {
      this.handling = false;
    }
  }

  _logError(error, meta) {
    logger.error(
      `[ErrorService] ${error.name}: ${error.message}
Context: ${meta.context}
Type: ${meta.type}
Stack: ${error.stack}`,
    );
  }

  _notifyUser(message, type, action) {
    if (this.displayedErrors.has(message)) return;
    const typeMap = {
      [ErrorTypes.API]: "error",
      [ErrorTypes.UI]: "error",
      [ErrorTypes.NETWORK_ERROR]: "warning",
      [ErrorTypes.HTTP_ERROR]: "warning",
      [ErrorTypes.SERVICE]: "error",
      [ErrorTypes.CONTEXT]: "warning",
      [ErrorTypes.VALIDATION]: "warning",
      [ErrorTypes.INTEGRATION]: "warning",
      [ErrorTypes.API_KEY_INVALID]: "error",
      [ErrorTypes.API_KEY_MISSING]: "error",
      [ErrorTypes.API_URL_MISSING]: "error",
      [ErrorTypes.MODEL_MISSING]: "error",
      [ErrorTypes.MODEL_OVERLOADED]: "warning",
      [ErrorTypes.QUOTA_EXCEEDED]: "warning",
      [ErrorTypes.GEMINI_QUOTA_REGION]: "warning",
      [ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED]: "warning",
    };
    const toastType = typeMap[type] || "error";
    
    this.notifier.show(message, toastType, true, 5000, action);
    this.displayedErrors.add(message);
    setTimeout(() => this.displayedErrors.delete(message), 5500);
  }
}

export async function handleUIError(err, context = "") {
  const handler = ErrorHandler.getInstance();
  return handler.handle(err, { type: ErrorTypes.UI, context });
}