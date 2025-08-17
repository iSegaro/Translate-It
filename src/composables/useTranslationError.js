// useTranslationError.js
// Centralized translation error management composable

import { ref, computed, onUnmounted } from 'vue'
import { useErrorHandler } from './useErrorHandler.js'
import { ErrorHandler } from '../error-management/ErrorHandler.js'
import { getErrorDisplayStrategy, processErrorMessage, shouldShowRetry, shouldShowSettings } from '../error-management/ErrorDisplayStrategies.js'
import { matchErrorToType } from '../error-management/ErrorMatcher.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useTranslationError')

/**
 * Translation error management composable
 * Provides centralized error handling for translation contexts
 * 
 * @param {string} context - Translation context ('popup', 'sidepanel', 'content', 'selection')
 * @returns {Object} Error management interface
 */
export function useTranslationError(context = 'unknown') {
  // Error state
  const currentError = ref(null)
  const errorMessage = ref('')
  const errorType = ref('')
  const canRetry = ref(false)
  const canOpenSettings = ref(false)
  const errorTimestamp = ref(null)
  
  // Error handling
  const { handleTranslationError, getErrorForDisplay, isRetryableError } = useErrorHandler()
  const errorHandler = ErrorHandler.getInstance()
  
  // UI error listener for real-time error updates
  let unsubscribeListener = null
  
  // Computed properties
  const hasError = computed(() => Boolean(currentError.value && errorMessage.value))
  const errorDisplayLevel = computed(() => {
    if (!errorType.value) return 'detailed'
    const strategy = getErrorDisplayStrategy(context, errorType.value)
    return strategy.errorLevel
  })
  
  const processedErrorMessage = computed(() => {
    if (!errorMessage.value) return ''
    return processErrorMessage(errorMessage.value, errorDisplayLevel.value, context)
  })
  
  /**
   * Handle a translation error
   * @param {Error|string} error - The error to handle
   * @param {Object} options - Additional options
   */
  const handleError = async (error, options = {}) => {
    if (!error) {
      clearError()
      return
    }
    
    try {
      logger.debug(`[${context}] Handling translation error:`, error)
      
      // Get error information
      const errorInfo = await getErrorForDisplay(error, context)
      const errorTypeValue = matchErrorToType(error?.message || error)
      const strategy = getErrorDisplayStrategy(context, errorTypeValue)
      
      // Update error state
      currentError.value = error
      errorMessage.value = errorInfo.message
      errorType.value = errorTypeValue
      errorTimestamp.value = errorInfo.timestamp
      canRetry.value = shouldShowRetry(errorTypeValue, strategy)
      canOpenSettings.value = shouldShowSettings(errorTypeValue, strategy)
      
      // Handle error with appropriate strategy
      const enhancedOptions = {
        showToast: strategy.showToast,
        showInUI: strategy.showInUI,
        errorLevel: strategy.errorLevel,
        component: 'translation',
        ...options
      }
      
      await handleTranslationError(error, context, enhancedOptions)
      
      logger.debug(`[${context}] Error handled with strategy:`, strategy)
      
    } catch (handlerError) {
      logger.error(`[${context}] Failed to handle translation error:`, handlerError)
      
      // Fallback error state
      currentError.value = error
      errorMessage.value = 'An error occurred during translation'
      errorType.value = 'UNKNOWN'
      errorTimestamp.value = Date.now()
      canRetry.value = true
      canOpenSettings.value = false
    }
  }
  
  /**
   * Clear current error state
   */
  const clearError = () => {
    currentError.value = null
    errorMessage.value = ''
    errorType.value = ''
    errorTimestamp.value = null
    canRetry.value = false
    canOpenSettings.value = false
    
    logger.debug(`[${context}] Error state cleared`)
  }
  
  /**
   * Check if an error is retryable
   * @param {Error|string} error - Error to check
   * @returns {boolean} True if retryable
   */
  const isErrorRetryable = (error) => {
    return isRetryableError(error)
  }
  
  /**
   * Get retry callback for current error
   * @param {Function} retryFunction - Function to call for retry
   * @returns {Function} Retry callback
   */
  const getRetryCallback = (retryFunction) => {
    return async () => {
      if (!canRetry.value || !retryFunction) {
        logger.warn(`[${context}] Retry attempted but not available`)
        return
      }
      
      try {
        logger.info(`[${context}] Retrying after error: ${errorType.value}`)
        clearError() // Clear error before retry
        await retryFunction()
      } catch (retryError) {
        logger.error(`[${context}] Retry failed:`, retryError)
        await handleError(retryError)
      }
    }
  }
  
  /**
   * Get settings callback for current error
   * @returns {Function} Settings callback
   */
  const getSettingsCallback = () => {
    return () => {
      if (!canOpenSettings.value) {
        logger.warn(`[${context}] Settings attempted but not available`)
        return
      }
      
      try {
        logger.info(`[${context}] Opening settings for error: ${errorType.value}`)
        // Use ErrorHandler's settings callback
        errorHandler.openOptionsPageCallback?.()
      } catch (settingsError) {
        logger.error(`[${context}] Failed to open settings:`, settingsError)
      }
    }
  }
  
  /**
   * Setup UI error listener for real-time error updates
   */
  const setupErrorListener = () => {
    if (unsubscribeListener) return // Already setup
    
    const listener = (errorData) => {
      // Only handle errors for our context
      if (errorData.context && !errorData.context.includes(context)) {
        return
      }
      
      logger.debug(`[${context}] Received UI error update:`, errorData)
      
      // Update error state from listener
      currentError.value = errorData
      errorMessage.value = errorData.message
      errorType.value = errorData.type
      errorTimestamp.value = errorData.timestamp
      
      const strategy = getErrorDisplayStrategy(context, errorData.type)
      canRetry.value = shouldShowRetry(errorData.type, strategy)
      canOpenSettings.value = shouldShowSettings(errorData.type, strategy)
    }
    
    unsubscribeListener = errorHandler.addUIErrorListener(listener)
    logger.debug(`[${context}] Error listener setup`)
  }
  
  /**
   * Cleanup error listener
   */
  const cleanupErrorListener = () => {
    if (unsubscribeListener) {
      unsubscribeListener()
      unsubscribeListener = null
      logger.debug(`[${context}] Error listener cleaned up`)
    }
  }
  
  // Setup listener on creation
  setupErrorListener()
  
  // Cleanup on unmount
  onUnmounted(() => {
    cleanupErrorListener()
  })
  
  return {
    // Error state
    currentError,
    errorMessage: processedErrorMessage,
    errorType,
    hasError,
    canRetry,
    canOpenSettings,
    errorTimestamp,
    
    // Methods
    handleError,
    clearError,
    isErrorRetryable,
    getRetryCallback,
    getSettingsCallback,
    
    // Utils
    setupErrorListener,
    cleanupErrorListener
  }
}