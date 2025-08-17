// Window Error Handlers Utility
// Provides Vue app-level error boundaries for extension context issues

import browser from 'webextension-polyfill'
import { ErrorHandler } from '@/error-management/ErrorHandler.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
import ExtensionContextManager from '@/utils/core/extensionContext.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'windowErrorHandlers')

/**
 * Setup window-level error handlers for Vue applications
 * This creates error boundaries to catch uncaught errors and unhandled promise rejections
 * that may occur from third-party libraries when extension context becomes invalid
 * 
 * @param {string} context - Context identifier (e.g., 'popup', 'sidepanel', 'options')
 */
export function setupWindowErrorHandlers(context) {
  const errorHandler = ErrorHandler.getInstance()
  
  /**
   * Handle uncaught errors (including from third-party libraries)
   */
  const handleWindowError = async (event) => {
    const error = event.error || new Error(event.message)
    
    // Use ExtensionContextManager for unified error detection and handling
    if (ExtensionContextManager.isContextError(error)) {
      logger.debug(`[${context}] Window error boundary caught extension context error:`, error.message)
      
      ExtensionContextManager.handleContextError(error, `${context}-window`)
      
      // Also handle through centralized error handler
      await errorHandler.handle(error, {
        context: `${context}-window`,
        silent: true
      })
      
      event.preventDefault() // Prevent default browser error handling
      return true
    }
    
    return false // Let other errors bubble up
  }
  
  /**
   * Handle unhandled promise rejections
   */
  const handleUnhandledRejection = async (event) => {
    const error = event.reason
    
    // Use ExtensionContextManager for unified error detection and handling
    if (ExtensionContextManager.isContextError(error)) {
      logger.debug(`[${context}] Window error boundary caught extension context promise rejection:`, error?.message || error)
      
      ExtensionContextManager.handleContextError(error, `${context}-promise`)
      
      // Also handle through centralized error handler  
      await errorHandler.handle(error, {
        context: `${context}-promise`,
        silent: true
      })
      
      event.preventDefault() // Prevent unhandled rejection
      return true
    }
    
    return false // Let other rejections bubble up
  }
  
  // Register event listeners
  window.addEventListener('error', handleWindowError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
  
  logger.debug(`[${context}] Window error handlers registered`)
  
  // Return cleanup function
  return () => {
    window.removeEventListener('error', handleWindowError)
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    logger.debug(`[${context}] Window error handlers cleaned up`)
  }
}

/**
 * Check if browser API is available and extension context is valid
 * @returns {boolean} True if extension context is valid
 * @deprecated Use ExtensionContextManager.isValidSync() instead
 */
export function isExtensionContextValid() {
  return ExtensionContextManager.isValidSync()
}

/**
 * Setup browser API globals for compatibility
 * This ensures that window.browser and window.chrome are available for third-party plugins
 */
export function setupBrowserAPIGlobals() {
  if (typeof window !== 'undefined') {
    if (!window.browser && typeof browser !== 'undefined') {
      window.browser = browser
    }
    if (!window.chrome && typeof browser !== 'undefined') {
      window.chrome = browser // Some plugins expect chrome object
    }
  }
}
