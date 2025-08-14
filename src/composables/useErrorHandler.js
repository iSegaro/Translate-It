// Vue Error Handler Composable
// Provides unified error handling for Vue components using ErrorService

import { ref } from 'vue'
import { ErrorHandler } from '../error-management/ErrorService.js'
import { ErrorTypes } from '../error-management/ErrorTypes.js'
import { matchErrorToType } from '../error-management/ErrorMatcher.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useErrorHandler');

/**
 * Vue composable for unified error handling
 * Integrates with ErrorService and provides smart UI feedback
 */
export function useErrorHandler() {
  const errorHandler = ErrorHandler.getInstance()
  const isHandlingError = ref(false)
  
  /**
   * Main error handling function
   * @param {Error|string} error - The error to handle
   * @param {string} context - Context information for debugging
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>} - Returns true if error was handled gracefully
   */
  const handleError = async (error, context = 'vue-component', options = {}) => {
    if (isHandlingError.value) return false
    
    isHandlingError.value = true
    
    try {
      // Determine error type
      const errorType = matchErrorToType(error?.message || error)
      
      // Handle the error through ErrorService
      await errorHandler.handle(error, { 
        type: errorType, 
        context: `vue-${context}`,
        ...options 
      })
      
      // Return true for silent/graceful errors
      const silentErrors = [
        ErrorTypes.CONTEXT,
        ErrorTypes.EXTENSION_CONTEXT_INVALIDATED
      ]
      
      return silentErrors.includes(errorType)
      
    } catch (handlerError) {
      logger.error('[useErrorHandler] Failed to handle error:', handlerError)
      return false
    } finally {
      isHandlingError.value = false
    }
  }
  
  /**
   * Handle connection errors specifically (for tab communication)
   * @param {Error} error - Connection error
   * @param {string} context - Context information
   * @returns {boolean} - True if it's a connection error that was handled
   */
  const handleConnectionError = async (error, context = 'vue-connection') => {
    const connectionErrors = [
      'Could not establish connection',
      'Receiving end does not exist',
      'message port closed',
      'Extension context invalidated'
    ]
    
    const isConnectionError = connectionErrors.some(msg => 
      error?.message?.includes(msg)
    )
    
    if (isConnectionError) {
      await handleError(error, context)
      return true
    }
    
    return false
  }
  
  /**
   * Wrapper for async operations with automatic error handling
   * @param {Function} asyncFn - Async function to execute
   * @param {string} context - Context for error handling
   * @param {Object} options - Additional options
   * @returns {Promise<any>} - Result of the async function
   */
  const withErrorHandling = async (asyncFn, context = 'vue-operation', options = {}) => {
    try {
      return await asyncFn()
    } catch (error) {
      const wasHandledGracefully = await handleError(error, context, options)
      
      // If error was handled gracefully, don't rethrow
      if (wasHandledGracefully) {
        return null
      }
      
      // For non-graceful errors, rethrow after handling
      throw error
    }
  }
  
  /**
   * Check if an error should be handled silently
   * @param {Error|string} error - The error to check
   * @returns {boolean} - True if error should be silent
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
 * Global Vue error handler setup function
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