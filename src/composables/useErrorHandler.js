// Vue Error Handler Composable
// Provides unified error handling for Vue components using ErrorHandler

import { ref } from 'vue'
import { ErrorHandler } from '../error-management/ErrorHandler.js'
import { ErrorTypes } from '../error-management/ErrorTypes.js'
import { matchErrorToType } from '../error-management/ErrorMatcher.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'

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
  
  return {
    handleError,
    handleConnectionError,
    withErrorHandling,
    isSilentError,
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
  app.config.warnHandler = (msg, instance, trace) => {
    logger.warn(`[${appName}] Vue Warning:`, msg, trace)
  }
}