// File: src/error-management/ErrorHandler.js

import NotificationManager from "@/core/managers/core/NotificationManager.js";
import { getErrorMessage } from "./ErrorMessages.js";
import { ErrorTypes } from "./ErrorTypes.js";
import { 
  matchErrorToType, 
  isSilentError, 
  shouldSuppressConsole, 
  needsSettings,
  CRITICAL_CONFIG_ERRORS,
  FATAL_ERRORS
} from "./ErrorMatcher.js";
import { getErrorDisplayStrategy, getErrorToastType, shouldShowRetry } from "./ErrorDisplayStrategies.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.ERROR, 'ErrorHandler');

let _instance = null; // Singleton instance

export class ErrorHandler {
  constructor(notifier) {
    if (_instance) {
      return _instance;
    }
    this.notifier = notifier || new NotificationManager();
    this.displayedErrors = new Set();
    this.handling = false;
    this.debugMode = false;
    this.errorListeners = new Set();
    _instance = this;
  }

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
      // Safely extract raw error message without triggering infinite recursion or stack depth
      let raw = 'Unknown Error';
      try {
        if (err instanceof Error) {
          raw = err.message || err.name || 'Error object';
        } else if (typeof err === 'object' && err !== null) {
          raw = typeof err.message === 'string' ? err.message : (err.type || err.code || 'Object error');
        } else {
          raw = String(err || 'Unknown error');
        }
      } catch {
        raw = 'Error processing failed';
      }

      // Handle extension context errors silently
      if (ExtensionContextManager.isContextError(err)) {
        ExtensionContextManager.handleContextError(err, meta.context || 'ErrorHandler');
        return err;
      }

      const type = matchErrorToType(err);
      
      // Determine message to display
      let msg;
      try {
        const genericMsg = await getErrorMessage(type);
        
        // Decide whether to use raw message or localized generic message
        const shouldUseGeneric = CRITICAL_CONFIG_ERRORS.has(type) || FATAL_ERRORS.has(type);
        
        if (!shouldUseGeneric && raw && raw.length > 5 && 
            !raw.includes('[object Object]') && !raw.startsWith('Error:')) {
          msg = raw;
        } else {
          msg = genericMsg;
        }
      } catch {
        msg = raw || 'An error occurred';
      }
      
      const displayStrategy = getErrorDisplayStrategy(meta.context || 'unknown', type);
      
      const enhancedMeta = {
        type: type,
        context: meta.context || 'unknown',
        showToast: displayStrategy.showToast,
        showInUI: displayStrategy.showInUI,
        errorLevel: displayStrategy.errorLevel || 'generic',
        timestamp: Date.now(),
        ...meta,
        ...(meta.isSilent !== undefined && { showToast: !meta.isSilent })
      };
      
      // Logging
      if (this.debugMode && !shouldSuppressConsole(type)) {
        const logLevel = enhancedMeta.showToast ? 'error' : 'debug';
        logger[logLevel](`[${type}] ${raw}`, err.stack);
      }

      if (isSilentError(type)) return err;

      // Notify UI
      if (enhancedMeta.showInUI) {
        this._notifyUIErrorListeners({
          message: msg,
          type: type,
          context: enhancedMeta.context,
          errorLevel: enhancedMeta.errorLevel,
          timestamp: enhancedMeta.timestamp
        });
      }

      // Show Toast
      if (enhancedMeta.showToast) {
        this._notifyUser(msg, type, enhancedMeta);
      }
      
      return err;
    } finally {
      this.handling = false;
    }
  }

  addUIErrorListener(listener) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  _notifyUIErrorListeners(errorData) {
    this.errorListeners.forEach(listener => {
      try { listener(errorData); } catch (err) { logger.error('UI listener error:', err); }
    });
  }

  async getErrorForUI(err, context = 'ui') {
    try {
      if (ExtensionContextManager.isContextError(err)) {
        const type = matchErrorToType(err);
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
      const type = matchErrorToType(err);
      
      let msg;
      try {
        const localizedMsg = await getErrorMessage(type);
        const shouldUseGeneric = CRITICAL_CONFIG_ERRORS.has(type) || FATAL_ERRORS.has(type);

        if (!shouldUseGeneric && raw && raw.length > 5 && !raw.includes('[object Object]')) {
          msg = raw;
        } else {
          msg = localizedMsg || raw || 'An error occurred';
        }
      } catch {
        msg = raw || 'An error occurred';
      }
      
      return {
        message: msg,
        type: type,
        context: context,
        timestamp: Date.now(),
        canRetry: shouldShowRetry(type, getErrorDisplayStrategy(context, type)),
        needsSettings: needsSettings(type)
      };
    } catch (error) {
      logger.error('Failed to get error for UI:', error);
      return {
        message: (err instanceof Error ? err.message : String(err)) || 'Unknown error',
        type: ErrorTypes.UNKNOWN,
        context: context,
        timestamp: Date.now(),
        canRetry: false,
        needsSettings: false
      };
    }
  }

  _notifyUser(message, type, options = {}) {
    if (this.displayedErrors.has(message)) return;

    const toastType = getErrorToastType(type);
    
    this.notifier.show(message, toastType, options.duration, {
      persistent: options.persistent || false,
      actions: options.actions || []
    });

    this.displayedErrors.add(message);
    
    if (!options.persistent) {
      setTimeout(() => this.displayedErrors.delete(message), (options.duration || 5500) + 500);
    }
  }
}

export async function handleUIError(err, context = "") {
  return ErrorHandler.getInstance().handle(err, { type: ErrorTypes.UI, context });
}