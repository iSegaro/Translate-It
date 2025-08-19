// ErrorDisplayStrategies.js
// Context-aware error display strategies for different UI contexts

import { ErrorTypes } from './ErrorTypes.js'

/**
 * Error display strategies for different contexts
 */
export const ErrorDisplayStrategies = {
  // Content script context - users see toast notifications only
  content: {
    showToast: true,
    showInUI: false,
    errorLevel: 'detailed', // Show detailed errors in toast since it's the only way to communicate
    defaultDuration: 6000,  // Longer duration for reading
    position: 'top-right'
  },

  // Popup context - users see errors in translation field primarily
  popup: {
    showToast: false,       // Avoid toast overlap with small popup
    showInUI: true,
    errorLevel: 'detailed', // Show detailed errors in UI
    supportRetry: true,
    supportSettings: true
  },

  // Sidepanel context - users see errors in translation field with optional toast for critical errors
  sidepanel: {
    showToast: false,       // Generally avoid toast, show in UI
    showInUI: true,
    errorLevel: 'detailed', // Show detailed errors in UI
    supportRetry: true,
    supportSettings: true,
    criticalErrorsShowToast: true // Only critical errors show toast
  },

  // Selection window context - minimal inline error display
  selection: {
    showToast: false,
    showInUI: true,
    errorLevel: 'simplified', // Keep it simple for floating UI
    maxMessageLength: 100,
    supportRetry: false,    // No retry in selection context
    supportSettings: false  // No settings access from selection
  },

  // Windows Manager context - errors shown in window UI only
  'windows-manager': {
    showToast: false,       // No toast - errors shown in translation window
    showInUI: true,
    errorLevel: 'detailed', // Show detailed errors in UI
    supportRetry: false,    // Retry handled by re-selecting text
    supportSettings: false // No settings access from windows
  },

  // Windows Manager translate context (specific to translation errors)
  'windows-manager-translate': {
    showToast: false,       // No toast - errors shown in translation window
    showInUI: true,
    errorLevel: 'detailed', // Show detailed errors in UI
    supportRetry: false,    // Retry handled by re-selecting text
    supportSettings: false // No settings access from windows
  },

  // Select Element context - show toast for user awareness since no permanent UI
  'select-element': {
    showToast: true,        // Show toast since no permanent error UI
    showInUI: false,
    errorLevel: 'detailed', // Show specific error details in toast
    defaultDuration: 6000,  // Longer duration for reading
    supportRetry: false,    // Retry handled by re-selecting element
    supportSettings: true   // Allow settings access for config errors
  },

  // Background/service context - toast notifications for user awareness
  background: {
    showToast: true,
    showInUI: false,
    errorLevel: 'generic',  // Keep it simple
    defaultDuration: 4000
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
 * Errors that should never show toast notifications
 */
export const SilentErrorTypes = new Set([
  ErrorTypes.CONTEXT,
  ErrorTypes.EXTENSION_CONTEXT_INVALIDATED // Handled by refresh message
])

/**
 * Get error display strategy for a given context and error type
 * @param {string} context - UI context (popup, sidepanel, content, selection, background)
 * @param {string} errorType - Error type from ErrorTypes
 * @returns {Object} Display strategy configuration
 */
export function getErrorDisplayStrategy(context, errorType) {
  const baseStrategy = ErrorDisplayStrategies[context] || ErrorDisplayStrategies.background
  
  // Clone base strategy to avoid mutations
  const strategy = { ...baseStrategy }
  
  // Override for critical errors
  if (CriticalErrorTypes.has(errorType)) {
    strategy.showToast = true
    strategy.errorLevel = 'detailed'
    
    // For popup/sidepanel, show both UI and toast for critical errors
    if (context === 'popup' || context === 'sidepanel') {
      strategy.showInUI = true
    }
  }
  
  // Override for silent errors
  if (SilentErrorTypes.has(errorType)) {
    strategy.showToast = false
    strategy.showInUI = false
  }
  
  // Special cases for specific error types
  switch (errorType) {
    case ErrorTypes.NETWORK_ERROR:
    case ErrorTypes.HTTP_ERROR:
      // Network errors should always be retryable
      strategy.supportRetry = true
      break
      
    case ErrorTypes.TEXT_EMPTY:
    case ErrorTypes.TEXT_TOO_LONG:
      // Validation errors don't need toast in any UI context
      if (context !== 'content' && context !== 'background') {
        strategy.showToast = false
      }
      break
      
    case ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED:
      // Language pair errors should suggest settings
      strategy.supportSettings = true
      strategy.suggestAction = 'change-provider'
      break
      
    case ErrorTypes.MODEL_MISSING:
    case ErrorTypes.API_URL_MISSING:
      // Configuration errors always need settings access
      strategy.supportSettings = true
      strategy.suggestAction = 'open-settings'
      break
  }
  
  return strategy
}

/**
 * Get user-friendly error message based on context and error level
 * @param {string} message - Original error message
 * @param {string} errorLevel - Error level (detailed, simplified, generic)
 * @returns {string} Processed error message
 */
export function processErrorMessage(message, errorLevel) {
  if (!message) return 'An error occurred'
  
  switch (errorLevel) {
    case 'simplified':
      // For selection window - keep it very short
      if (message.length > 100) {
        return message.substring(0, 97) + '...'
      }
      return message
      
    case 'generic': {
      // For background/toast contexts - provide helpful but not technical info
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
      // For UI contexts - show full detailed message
      return message
  }
}

/**
 * Determine if error should show retry action
 * @param {string} errorType - Error type
 * @param {Object} strategy - Display strategy
 * @returns {boolean} True if retry should be shown
 */
export function shouldShowRetry(errorType, strategy) {
  if (!strategy.supportRetry) return false
  
  const retryableErrors = new Set([
    ErrorTypes.NETWORK_ERROR,
    ErrorTypes.HTTP_ERROR,
    ErrorTypes.MODEL_OVERLOADED,
    ErrorTypes.TRANSLATION_FAILED,
    ErrorTypes.SERVER_ERROR
  ])
  
  return retryableErrors.has(errorType)
}

/**
 * Determine if error should show settings action
 * @param {string} errorType - Error type
 * @param {Object} strategy - Display strategy
 * @returns {boolean} True if settings should be shown
 */
export function shouldShowSettings(errorType, strategy) {
  if (!strategy.supportSettings) return false
  
  const settingsErrors = new Set([
    ErrorTypes.API_KEY_INVALID,
    ErrorTypes.API_KEY_MISSING,
    ErrorTypes.API_URL_MISSING,
    ErrorTypes.MODEL_MISSING,
    ErrorTypes.MODEL_OVERLOADED,
    ErrorTypes.QUOTA_EXCEEDED,
    ErrorTypes.GEMINI_QUOTA_REGION,
    ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED
  ])
  
  return settingsErrors.has(errorType)
}