// src/composables/actions/useCopyAction.js
// Unified copy action composable

import { ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

// Lazy logger initialization to avoid TDZ issues
let logger = null;
function getLogger() {
  if (!logger) {
    try {
      logger = getScopedLogger(LOG_COMPONENTS.TEXT_ACTIONS, 'useCopyAction');
      // Ensure logger is not null
      if (!logger) {
        logger = {
          debug: () => {},
          warn: () => {},
          error: () => {},
          info: () => {},
          init: () => {}
        };
      }
    } catch (error) {
      // Fallback to noop logger
      logger = {
        debug: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
        init: () => {}
      };
    }
  }
  return logger;
}

export function useCopyAction() {
  // Use ResourceTracker for automatic cleanup
  useResourceTracker('copy-action')
  
  // State
  const isCopying = ref(false)
  const lastCopiedText = ref('')
  const copyError = ref(null)

  /**
   * Copy text to clipboard with fallback support
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} Success status
   */
  const copyText = async (text) => {
    if (!text || typeof text !== 'string') {
      getLogger().warn('[useCopyAction] Invalid text provided for copy')
      return false
    }

    if (isCopying.value) {
      getLogger().warn('[useCopyAction] Copy operation already in progress')
      return false
    }

    isCopying.value = true
    copyError.value = null

    try {
      // Primary method: Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        getLogger().debug('[useCopyAction] Text copied via Clipboard API')
      } else {
        // Fallback method: document.execCommand
        await copyTextFallback(text)
        getLogger().debug('[useCopyAction] Text copied via fallback method')
      }

      lastCopiedText.value = text
      return true

    } catch (error) {
      getLogger().error('[useCopyAction] Copy failed:', error)
      copyError.value = error
      
      // Try fallback if primary method failed
      try {
        await copyTextFallback(text)
        getLogger().debug('[useCopyAction] Text copied via fallback after primary failure')
        lastCopiedText.value = text
        return true
      } catch (fallbackError) {
        getLogger().error('[useCopyAction] Fallback copy also failed:', fallbackError)
        copyError.value = fallbackError
        return false
      }
    } finally {
      isCopying.value = false
    }
  }

  /**
   * Fallback copy method using document.execCommand
   * @param {string} text - Text to copy
   */
  const copyTextFallback = (text) => {
    return new Promise((resolve, reject) => {
      try {
        // Create temporary textarea
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        textarea.style.pointerEvents = 'none'
        
        document.body.appendChild(textarea)
        textarea.select()
        textarea.setSelectionRange(0, 99999) // For mobile devices

        // Execute copy command
        const successful = document.execCommand('copy')
        document.body.removeChild(textarea)

        if (successful) {
          resolve()
        } else {
          reject(new Error('execCommand copy failed'))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Copy with feedback callback
   * @param {string} text - Text to copy
   * @param {Function} feedbackCallback - Callback for success/error feedback
   * @returns {Promise<boolean>} Success status
   */
  const copyWithFeedback = async (text, feedbackCallback = null) => {
    const success = await copyText(text)
    
    if (feedbackCallback) {
      feedbackCallback(success ? 'success' : 'error', {
        text: success ? text : '',
        error: copyError.value
      })
    }
    
    return success
  }

  /**
   * Get the last copied text
   * @returns {string} Last copied text
   */
  const getLastCopiedText = () => {
    return lastCopiedText.value
  }

  /**
   * Clear copy history and error state
   */
  const clearCopyState = () => {
    lastCopiedText.value = ''
    copyError.value = null
  }

  /**
   * Check if copy is supported
   * @returns {boolean} Whether copy is supported
   */
  const isCopySupported = () => {
    return !!(navigator.clipboard?.writeText || document.execCommand)
  }

  return {
    // State
    isCopying,
    lastCopiedText,
    copyError,
    
    // Methods
    copyText,
    copyWithFeedback,
    copyTextFallback,
    getLastCopiedText,
    clearCopyState,
    isCopySupported
  }
}
