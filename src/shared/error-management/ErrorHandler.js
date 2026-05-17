// File: src/shared/error-management/ErrorHandler.js

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
    // SECOND LAYER: If context is already invalidated, exit immediately and silently
    if (!ExtensionContextManager.isValidSync()) {
      return err;
    }

    try {
      // Prioritize explicit type from meta for suppression and display logic
      const type = meta.type || matchErrorToType(err);

      // Safely extract raw error message without triggering infinite recursion or stack depth
      let raw = 'Unknown Error';
      try {
        if (err instanceof Error) {
          raw = err.message || err.name || 'Error object';
        } else if (err && typeof err === 'object') {
          raw = err.message || err.error || err.statusText || err.reason || err.type || err.code;
          
          if (!raw && err !== null) {
             try {
               const cleanErr = { ...err };
               delete cleanErr.partialResults;
               raw = JSON.stringify(cleanErr);
               if (raw === '{}') raw = '';
             } catch {
               raw = '';
             }
          }
          
          if (!raw) {
            raw = (typeof err.toString === 'function' && err.toString() !== '[object Object]') ? err.toString() : 'Unknown technical error';
          }
        } else {
          raw = String(err || 'Unknown error');
        }
      } catch {
        raw = 'Error processing failed';
      }

      // CRITICAL SECURITY FIX: Redact API keys from the raw error message before logging
      const redactKeys = (text) => {
        if (!text || typeof text !== 'string') return text;
        return text
          .replace(/(key|api_key)=([a-zA-Z0-9_-]+)/gi, '$1=***') // Mask URL params
          .replace(/(AIzaSy)[a-zA-Z0-9_-]{35}/g, '$1***'); // Mask standard Gemini key pattern
      };
      
      const sanitizedRaw = redactKeys(raw);

      // Handle extension context errors silently
      if (ExtensionContextManager.isContextError(err)) {
        ExtensionContextManager.handleContextError(err, meta.context || 'ErrorHandler');
        return err;
      }
      
      // Determine message to display
      let msg;
      try {
        let genericMsg = await getErrorMessage(type);
        let forceGeneric = false;

        // ENHANCEMENT: For Circuit Breaker, combine the original error (e.g. Network Error) 
        // with the Circuit Breaker message so the user knows WHY it was blocked.
        if (type === ErrorTypes.CIRCUIT_BREAKER_OPEN && err) {
          try {
            let originalType = err.originalType;
            const fullMessage = (typeof sanitizedRaw === 'string' ? sanitizedRaw : '') + (err.message || '');
            const lowerMsg = fullMessage.toLowerCase();
            
            // Priority 1: Direct string scanning (most reliable for combined messages)
            if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('network') || lowerMsg.includes('connection')) {
              originalType = ErrorTypes.NETWORK_ERROR;
            } else if (lowerMsg.includes('429') || lowerMsg.includes('rate limit') || lowerMsg.includes('quota')) {
              originalType = ErrorTypes.RATE_LIMIT_REACHED;
            }
            
            // Priority 2: Fallback to technical reason extraction
            if (!originalType && typeof sanitizedRaw === 'string' && sanitizedRaw.includes(': ')) {
              const parts = sanitizedRaw.split(': ');
              const reason = parts[parts.length - 1];
              originalType = matchErrorToType(reason);
            }

            if (originalType && originalType !== ErrorTypes.CIRCUIT_BREAKER_OPEN) {
              const originalMsg = await getErrorMessage(originalType);
              if (originalMsg && originalMsg !== genericMsg) {
                genericMsg = `${originalMsg}\n(${genericMsg})`;
                forceGeneric = true; // Use our combined localized message
              }
            }
          } catch (e) {
            logger.debug('Failed to build enhanced circuit breaker message', e);
          }
        }
        
        // Decide whether to use raw message or localized generic message
        let shouldUseGeneric = forceGeneric || CRITICAL_CONFIG_ERRORS.has(type) || FATAL_ERRORS.has(type);
        
        // EXCEPTION: If the error is an API error, prefer the specific technical message 
        // if it exists and is descriptive enough. 
        // NOTE: We removed CIRCUIT_BREAKER_OPEN from here to force localized Persian messages.
        const preferSpecific = [ErrorTypes.API_ERROR];
        if (!forceGeneric && preferSpecific.includes(type) && typeof sanitizedRaw === 'string' && sanitizedRaw.length > 10) {
          shouldUseGeneric = false;
        }

        if (!shouldUseGeneric && typeof sanitizedRaw === 'string' && sanitizedRaw.length > 5 && 
            !sanitizedRaw.includes('[object Object]') && !sanitizedRaw.startsWith('Error:')) {
          msg = sanitizedRaw;
        } else {
          msg = genericMsg;
        }
      } catch {
        msg = (typeof sanitizedRaw === 'string' ? sanitizedRaw : '') || 'An error occurred';
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
        let logLevel = 'debug';
        if (enhancedMeta.showToast || enhancedMeta.showInUI) {
          logLevel = getErrorToastType(type) === 'warning' ? 'warn' : 'error';
        }
        
        const logPrefix = `[${type}]${enhancedMeta.context ? ` (${enhancedMeta.context})` : ''}`;
        logger[logLevel](logPrefix, err);
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
      // Logic removed
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

      let raw = 'Unknown Error';
      if (err instanceof Error) {
        raw = err.message || err.name || 'Error object';
      } else if (err && typeof err === 'object') {
        raw = typeof err.message === 'string' ? err.message : (err.type || err.code || 'Object error');
      } else {
        raw = String(err || 'Unknown error');
      }

      const type = matchErrorToType(err);
      
      let msg;
      try {
        let localizedMsg = await getErrorMessage(type);
        let forceGeneric = false;

        // ENHANCEMENT: Match the logic in handle() for consistent Circuit Breaker messaging
        if (type === ErrorTypes.CIRCUIT_BREAKER_OPEN && err) {
          try {
            let originalType = err.originalType;
            const fullMessage = (typeof raw === 'string' ? raw : '') + (err.message || '');
            const lowerMsg = fullMessage.toLowerCase();
            
            // Priority 1: Direct string scanning (most reliable for combined messages)
            if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('network') || lowerMsg.includes('connection')) {
              originalType = ErrorTypes.NETWORK_ERROR;
            } else if (lowerMsg.includes('429') || lowerMsg.includes('rate limit') || lowerMsg.includes('quota')) {
              originalType = ErrorTypes.RATE_LIMIT_REACHED;
            }
            
            // Priority 2: Fallback to technical reason extraction
            if (!originalType && typeof raw === 'string' && raw.includes(': ')) {
              const parts = raw.split(': ');
              const reason = parts[parts.length - 1];
              originalType = matchErrorToType(reason);
            }

            if (originalType && originalType !== ErrorTypes.CIRCUIT_BREAKER_OPEN) {
              const originalMsg = await getErrorMessage(originalType);
              if (originalMsg && originalMsg !== localizedMsg) {
                localizedMsg = `${originalMsg}\n(${localizedMsg})`;
                forceGeneric = true;
              }
            }
          } catch (e) {
            logger.debug('Failed to build enhanced circuit breaker message for UI', e);
          }
        }

        let shouldUseGeneric = forceGeneric || CRITICAL_CONFIG_ERRORS.has(type) || FATAL_ERRORS.has(type);

        // Exception for API errors to show descriptive technical details.
        // NOTE: We removed CIRCUIT_BREAKER_OPEN from here to force localized Persian messages.
        const preferSpecific = [ErrorTypes.API_ERROR];
        if (!forceGeneric && preferSpecific.includes(type) && typeof raw === 'string' && raw.length > 10) {
          shouldUseGeneric = false;
        }

        if (!shouldUseGeneric && typeof raw === 'string' && raw.length > 5 && !raw.includes('[object Object]')) {
          msg = raw;
        } else {
          msg = localizedMsg || (typeof raw === 'string' ? raw : '') || 'An error occurred';
        }
      } catch {
        msg = (typeof raw === 'string' ? raw : '') || 'An error occurred';
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
    if (!message || typeof message !== 'string' || this.displayedErrors.has(message)) return;

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
