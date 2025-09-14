// Vue Error Handler Composable
// Provides unified error handling for Vue components using ErrorHandler

import { ref } from 'vue'
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js'
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js'
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useErrorHandler')

/**
 * useErrorHandler composable - comprehensive error handling for Vue components
 * 
 * REFACTORED: Now uses the unified ErrorHandler for consistent error processing
 * This ensures all errors go through the same centralized handling system
 */
export function useErrorHandler() {
  const isHandlingError = ref(false)
  
  /**
   * Main error handler
   * @param {Error|string} error - The error to handle
   * @param {string} context - Context where error occurred
   * @param {Object} options - Additional options
   */
  const handleError = async (error, context = 'unknown', options = {}) => {
    if (isHandlingError.value) {
      logger.warn('Error handling already in progress, skipping duplicate')
      return
    }
    
    isHandlingError.value = true
    
    try {
      // Use the centralized ErrorHandler singleton
      const errorHandler = ErrorHandler.getInstance()
      
      // Determine error type
      const errorType = matchErrorToType(error?.message || error)
      
      // Handle the error with proper metadata
      await errorHandler.handle(error, {
        type: errorType,
        context,
        component: options.component,
        vue: true,
        ...options
      })
      
    } catch (handlerError) {
      // Fallback logging if ErrorHandler itself fails
      logger.error(`[useErrorHandler] Handler failed for context "${context}":`, handlerError)
      logger.error(`[useErrorHandler] Original error:`, error)
    } finally {
      isHandlingError.value = false
    }
  }
  
  /**
   * Handle connection/network errors specifically
   * @param {Error} error - Network error
   * @param {string} context - Context of the error
   */
  const handleConnectionError = async (error, context = 'network') => {
    await handleError(error, `${context}-connection`, {
      type: ErrorTypes.NETWORK_ERROR
    })
  }
  
  /**
   * Wrapper for async operations with error handling
   * @param {Function} asyncFn - Async function to execute
   * @param {string} context - Context for error reporting
   * @param {Object} options - Additional options
   */
  const withErrorHandling = async (asyncFn, context = 'async-operation', options = {}) => {
    try {
      return await asyncFn()
    } catch (error) {
      await handleError(error, context, options)
      
      // Re-throw if specified
      if (options.rethrow) {
        throw error
      }
      
      return null
    }
  }
  
  /**
   * Handle translation-specific errors with context awareness
   * @param {Error|string} error - Translation error
   * @param {string} context - Translation context (popup/sidepanel/content)
   * @param {Object} options - Additional options
   */
  const handleTranslationError = async (error, context = 'translation', options = {}) => {
    const enhancedOptions = {
      showToast: false, // Default: don't show toast for translation errors
      showInUI: true,   // Default: show in UI fields
      errorLevel: context === 'content' ? 'simplified' : 'detailed',
      component: 'translation',
      ...options
    }
    
    await handleError(error, `translation-${context}`, enhancedOptions)
  }

  /**
   * Get error information for UI display without handling
   * @param {Error|string} error - Error to process
   * @param {string} context - Context where error occurred
   * @returns {Object} Error information for UI
   */
  const getErrorForDisplay = async (error, context = 'ui') => {
    const errorHandler = ErrorHandler.getInstance()
    return await errorHandler.getErrorForUI(error, context)
  }

  /**
   * Handle errors that should only show toast notifications
   * @param {Error|string} error - Error to handle
   * @param {string} context - Context of the error
   */
  const handleToastOnlyError = async (error, context = 'toast') => {
    await handleError(error, context, {
      showToast: true,
      showInUI: false,
      errorLevel: 'generic'
    })
  }

  /**
   * Check if an error should be handled silently
   * @param {Error|string} error - Error to check
   * @returns {boolean} True if error should be silent
   */
  const isSilentError = (error) => {
    const errorType = matchErrorToType(error?.message || error)
    const silentErrors = [
      ErrorTypes.CONTEXT,
      ErrorTypes.EXTENSION_CONTEXT_INVALIDATED
    ]
    
    return silentErrors.includes(errorType)
  }

  /**
   * Check if an error is retryable
   * @param {Error|string} error - Error to check
   * @returns {boolean} True if error can be retried
   */
  const isRetryableError = (error) => {
    const errorType = matchErrorToType(error?.message || error)
    const retryableErrors = [
      ErrorTypes.NETWORK_ERROR,
      ErrorTypes.HTTP_ERROR,
      ErrorTypes.MODEL_OVERLOADED,
      ErrorTypes.TRANSLATION_FAILED,
      ErrorTypes.SERVER_ERROR
    ]
    
    return retryableErrors.includes(errorType)
  }
  
  return {
    handleError,
    handleConnectionError,
    handleTranslationError,
    handleToastOnlyError,
    withErrorHandling,
    getErrorForDisplay,
    isSilentError,
    isRetryableError,
    isHandlingError
  }
}

/**
 * Setup global error handler for Vue app
 * Call this in main.js for each Vue app
 */
export function setupGlobalErrorHandler(app, appName = 'vue-app') {
  const errorHandler = ErrorHandler.getInstance()
  
  app.config.errorHandler = async (error, instance, info) => {
    try {
      const componentName = instance?.$options?.name || 'UnknownComponent'
      const errorType = matchErrorToType(error?.message || error)
      
      await errorHandler.handle(error, {
        type: errorType,
        context: `${appName}-global`,
        component: componentName,
        errorInfo: info,
        vue: true
      })
      
    } catch (handlerError) {
      logger.error(`[${appName}] Global error handler failed:`, handlerError)
    }
  }
  
  // Also handle unhandled promise rejections in Vue context
  app.config.warnHandler = (msg, instance) => {
    logger.warn(`[${appName}] Vue Warning:`, msg)
    logger.debug(`[${appName}] Vue warn instance summary:`, {
      componentName: instance?.type?.name || instance?.proxy?.$options?.name || null,
      vnodeIsFunction: typeof instance?.vnode?.type === 'function',
      vnodeName: instance?.vnode?.type?.name || null,
      vnodeFile: instance?.vnode?.type?.__file || null,
      proxyIsVue: !!instance?.proxy?._isVue
    })
  }
}