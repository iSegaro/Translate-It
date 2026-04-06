// ErrorDisplayStrategies.js
// Context-aware error display strategies for different UI contexts

import { ErrorTypes } from './ErrorTypes.js'
import { isSilentError, needsSettings } from './ErrorMatcher.js'
import { NOTIFICATION_TIME } from '@/shared/config/constants.js'

/**
 * Error display strategies for different contexts
 */
export const ErrorDisplayStrategies = {
  // Content script context - users see toast notifications only
  content: {
    showToast: true,
    showInUI: false,
    errorLevel: 'detailed',
    defaultDuration: NOTIFICATION_TIME.ERROR,
    position: 'top-right'
  },

  // Popup context - users see errors in translation field primarily
  popup: {
    showToast: false,
    showInUI: true,
    errorLevel: 'detailed',
    supportRetry: true,
    supportSettings: true
  },

  // Sidepanel context - users see errors in translation field
  sidepanel: {
    showToast: false,
    showInUI: true,
    errorLevel: 'detailed',
    supportRetry: true,
    supportSettings: true,
    criticalErrorsShowToast: true
  },

  // Selection window context - minimal inline error display
  selection: {
    showToast: false,
    showInUI: true,
    errorLevel: 'simplified',
    maxMessageLength: 100,
    supportRetry: false,
    supportSettings: false
  },

  // Windows Manager context - errors shown in window UI only
  'windows-manager': {
    showToast: false,
    showInUI: true,
    errorLevel: 'detailed',
    supportRetry: false,
    supportSettings: false
  },

  // Windows Manager translate context (specific to translation errors)
  'windows-manager-translate': {
    showToast: false,
    showInUI: true,
    errorLevel: 'detailed',
    supportRetry: false,
    supportSettings: false
  },

  // Select Element context - show toast for user awareness
  'select-element': {
    showToast: true,
    showInUI: false,
    errorLevel: 'detailed',
    defaultDuration: NOTIFICATION_TIME.ERROR,
    supportRetry: false,
    supportSettings: true
  },

  // Background/service context - toast notifications
  background: {
    showToast: true,
    showInUI: false,
    errorLevel: 'generic',
    defaultDuration: NOTIFICATION_TIME.DEFAULT,
  }
}

/**
 * Critical errors that should always show toast regardless of context
 */
export const CriticalErrorTypes = new Set([
  ErrorTypes.API_KEY_INVALID,
  ErrorTypes.API_KEY_MISSING,
  ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
  ErrorTypes.QUOTA_EXCEEDED,
  ErrorTypes.GEMINI_QUOTA_REGION
])

/**
 * Get error display strategy for a given context and error type
 * @param {string} context - UI context
 * @param {string} errorType - Error type from ErrorTypes
 * @returns {Object} Display strategy configuration
 */
export function getErrorDisplayStrategy(context, errorType) {
  const baseStrategy = ErrorDisplayStrategies[context] || ErrorDisplayStrategies.background
  const strategy = { ...baseStrategy }
  
  // Override for critical errors
  if (CriticalErrorTypes.has(errorType)) {
    strategy.showToast = true
    strategy.errorLevel = 'detailed'
    
    if (context === 'popup' || context === 'sidepanel') {
      strategy.showInUI = true
    }
  }
  
  // Override for silent errors using centralized Matcher
  if (isSilentError(errorType)) {
    strategy.showToast = false
    strategy.showInUI = false
  }
  
  // Special overrides for specific error types
  switch (errorType) {
    case ErrorTypes.NETWORK_ERROR:
    case ErrorTypes.HTTP_ERROR:
      strategy.supportRetry = true
      break
      
    case ErrorTypes.TEXT_EMPTY:
    case ErrorTypes.TEXT_TOO_LONG:
      if (context !== 'content' && context !== 'background') {
        strategy.showToast = false
      }
      break
      
    case ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED:
      strategy.supportSettings = true
      strategy.suggestAction = 'change-provider'
      break
      
    case ErrorTypes.MODEL_MISSING:
    case ErrorTypes.API_URL_MISSING:
      strategy.supportSettings = true
      strategy.suggestAction = 'open-settings'
      break
  }
  
  return strategy
}

/**
 * Determine toast level (error, warning, info) for an error type
 * @param {string} errorType 
 * @returns {string} Toast type
 */
export function getErrorToastType(errorType) {
  const warningTypes = new Set([
    ErrorTypes.NETWORK_ERROR,
    ErrorTypes.HTTP_ERROR,
    ErrorTypes.CONTEXT,
    ErrorTypes.VALIDATION,
    ErrorTypes.INTEGRATION,
    ErrorTypes.MODEL_OVERLOADED,
    ErrorTypes.QUOTA_EXCEEDED,
    ErrorTypes.GEMINI_QUOTA_REGION,
    ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED,
    ErrorTypes.TEXT_EMPTY,
    ErrorTypes.TEXT_TOO_LONG,
    ErrorTypes.PROMPT_INVALID,
    // Critical config errors are shown as warnings to suggest user action
    ErrorTypes.API_KEY_MISSING,
    ErrorTypes.API_KEY_INVALID,
    ErrorTypes.API_URL_MISSING,
    ErrorTypes.MODEL_MISSING,
    ErrorTypes.INSUFFICIENT_BALANCE,
    ErrorTypes.FORBIDDEN_ERROR,
    ErrorTypes.INVALID_REQUEST,
    ErrorTypes.RATE_LIMIT_REACHED,
    ErrorTypes.DEEPL_QUOTA_EXCEEDED,
    ErrorTypes.CIRCUIT_BREAKER_OPEN
  ]);

  return warningTypes.has(errorType) ? "warning" : "error";
}

/**
 * Get user-friendly error message based on context and error level
 */
export function processErrorMessage(message, errorLevel) {
  if (!message) return 'An error occurred'
  
  switch (errorLevel) {
    case 'simplified':
      return message.length > 100 ? message.substring(0, 97) + '...' : message
      
    case 'generic': {
      const genericMessages = {
        'API Key': 'Please check your API settings',
        'Network': 'Connection issue - please try again',
        'Quota': 'Service limit reached',
        'Model': 'Please check your provider settings'
      }
      
      for (const [key, value] of Object.entries(genericMessages)) {
        if (message.toLowerCase().includes(key.toLowerCase())) {
          return value
        }
      }
      return 'An error occurred - please try again'
    }
      
    case 'detailed':
    default:
      return message
  }
}

/**
 * Determine if error should show retry action
 */
export function shouldShowRetry(errorType, strategy) {
  if (!strategy?.supportRetry) return false
  
  // Use centralized matcher for basic retryability
  const retryableTypes = new Set([
    ErrorTypes.NETWORK_ERROR,
    ErrorTypes.HTTP_ERROR,
    ErrorTypes.MODEL_OVERLOADED,
    ErrorTypes.TRANSLATION_FAILED,
    ErrorTypes.SERVER_ERROR
  ]);
  
  return retryableTypes.has(errorType);
}

/**
 * Determine if error should show settings action
 */
export function shouldShowSettings(errorType, strategy) {
  if (strategy && strategy.supportSettings === false) return false
  return needsSettings(errorType);
}