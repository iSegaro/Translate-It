// File: src/error-management/ErrorHandler.js

import NotificationManager from "../managers/core/NotificationManager.js";
import { openOptionsPage } from "../utils/core/helpers.js";
import { getErrorMessage } from "./ErrorMessages.js";
import { ErrorTypes } from "./ErrorTypes.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import ExtensionContextManager from '../utils/core/extensionContext.js';
const logger = getScopedLogger('Error', 'ErrorHandler');

let _instance = null; // Singleton instance

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

export class ErrorHandler {
  constructor() {
    if (_instance) {
      return _instance;
    }
    this.notifier = new NotificationManager();
    this.displayedErrors = new Set();
    this.handling = false;
    this.openOptionsPageCallback = null; // Property to hold the callback
    this.debugMode = false; // Debug mode state
    this.errorListeners = new Set(); // For UI error state listeners
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
      
      // Use ExtensionContextManager for unified context error detection
      if (ExtensionContextManager.isContextError(err)) {
        ExtensionContextManager.handleContextError(err, meta.context || 'ErrorHandler');
        return err; // Handle silently
      }
      
      // For non-context errors, continue with normal error handling
      const { matchErrorToType } = await import('./ErrorMatcher.js');
      const type = matchErrorToType(raw);
      const msg = await getErrorMessage(type);
      
      // Enhanced metadata with defaults
      const enhancedMeta = {
        type: type,
        context: 'unknown',
        component: null,
        showToast: true,
        showInUI: false,
        errorLevel: 'generic',
        timestamp: Date.now(),
        ...meta
      };
      
      // Use instance debug mode instead of importing from config to avoid circular dependency
      if (this.debugMode && !SUPPRESS_CONSOLE.has(type)) {
        logger.error(`[${type}] ${raw}`, err.stack);
      }
      if (SILENT.has(type)) return err;

      // Notify UI error listeners if enabled
      if (enhancedMeta.showInUI) {
        this._notifyUIErrorListeners({
          message: msg,
          type: type,
          context: enhancedMeta.context,
          errorLevel: enhancedMeta.errorLevel,
          timestamp: enhancedMeta.timestamp
        });
      }

      // Show toast notification if enabled  
      if (enhancedMeta.showToast) {
        const action = OPEN_SETTINGS.has(type)
          ? () => this.openOptionsPageCallback?.() || openOptionsPage("api")
          : undefined;

        this._notifyUser(msg, enhancedMeta.type || ErrorTypes.SERVICE, action);
      }
      
      return err;
    } finally {
      this.handling = false;
    }
  }

  _logError(error, meta) {
    logger.error(
      `[ErrorHandler] ${error.name}: ${error.message}\nContext: ${meta.context}\nType: ${meta.type}\nStack: ${error.stack}`,
    );
  }

  // UI Error Listener Management
  addUIErrorListener(listener) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  removeUIErrorListener(listener) {
    this.errorListeners.delete(listener);
  }

  _notifyUIErrorListeners(errorData) {
    this.errorListeners.forEach(listener => {
      try {
        listener(errorData);
      } catch (err) {
        logger.error('Error in UI error listener:', err);
      }
    });
  }

  // Get error message for UI display without showing toast
  async getErrorForUI(err, context = 'ui') {
    try {
      // Handle context errors with ExtensionContextManager
      if (ExtensionContextManager.isContextError(err)) {
        const { matchErrorToType } = await import('./ErrorMatcher.js');
        const type = matchErrorToType(err instanceof Error ? err.message : String(err));
        return {
          message: ExtensionContextManager.getContextErrorMessage(type),
          type: type,
          context: context,
          timestamp: Date.now(),
          canRetry: false,
          needsSettings: false
        };
      }

      const raw = err instanceof Error ? err.message : String(err);
      const { matchErrorToType } = await import('./ErrorMatcher.js');
      const type = matchErrorToType(raw);
      const msg = await getErrorMessage(type);
      
      return {
        message: msg,
        type: type,
        context: context,
        timestamp: Date.now(),
        canRetry: this._canRetryError(type),
        needsSettings: OPEN_SETTINGS.has(type)
      };
    } catch (error) {
      logger.error('Failed to get error for UI:', error);
      return {
        message: 'An unknown error occurred',
        type: ErrorTypes.UNKNOWN,
        context: context,
        timestamp: Date.now(),
        canRetry: false,
        needsSettings: false
      };
    }
  }

  // Check if error type supports retry
  _canRetryError(type) {
    const retryableErrors = new Set([
      ErrorTypes.NETWORK_ERROR,
      ErrorTypes.HTTP_ERROR,
      ErrorTypes.MODEL_OVERLOADED,
      ErrorTypes.TRANSLATION_FAILED,
      ErrorTypes.TRANSLATION_TIMEOUT,
      ErrorTypes.SERVER_ERROR
    ]);
    return retryableErrors.has(type);
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