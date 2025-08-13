// src/composables/actions/usePasteAction.js
// Unified paste action composable

import { ref, onMounted, onUnmounted } from 'vue'
import { createLogger } from '@/utils/core/logger.js'

const logger = createLogger('Composables', 'usePasteAction')

export function usePasteAction() {
  // State
  const isPasting = ref(false)
  const hasClipboardContent = ref(false)
  const lastPastedText = ref('')
  const pasteError = ref(null)

  // Monitoring
  let clipboardMonitorInterval = null

  /**
   * Paste text from clipboard
   * @returns {Promise<string>} Pasted text
   */
  const pasteText = async () => {
    if (isPasting.value) {
      logger.warn('[usePasteAction] Paste operation already in progress')
      return ''
    }

    isPasting.value = true
    pasteError.value = null

    try {
      let text = ''

      // Primary method: Clipboard API
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText()
        logger.debug('[usePasteAction] Text pasted via Clipboard API')
      } else {
        // Fallback: try to get from selection or prompt user
        text = await pasteTextFallback()
        logger.debug('[usePasteAction] Text pasted via fallback method')
      }

      if (text && text.trim()) {
        lastPastedText.value = text
        await checkClipboardContent() // Update content status
        return text.trim()
      }

      return ''

    } catch (error) {
      logger.error('[usePasteAction] Paste failed:', error)
      pasteError.value = error
      return ''
    } finally {
      isPasting.value = false
    }
  }

  /**
   * Fallback paste method - limited functionality
   * @returns {Promise<string>} Empty string (fallback can't access clipboard)
   */
  const pasteTextFallback = async () => {
    // Note: For security reasons, there's no reliable fallback for reading clipboard
    // This method exists for API consistency but will return empty string
    logger.warn('[usePasteAction] Fallback paste method called - limited functionality')
    return ''
  }

  /**
   * Check if clipboard has text content
   * @returns {Promise<boolean>} Whether clipboard has content
   */
  const checkClipboardContent = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        hasClipboardContent.value = !!(text && text.trim())
        return hasClipboardContent.value
      }
    } catch (error) {
      // This is expected in many contexts due to security restrictions
      logger.debug('[usePasteAction] Clipboard check failed (expected):', error.message)
    }
    
    hasClipboardContent.value = false
    return false
  }

  /**
   * Paste with feedback callback
   * @param {Function} feedbackCallback - Callback for success/error feedback
   * @returns {Promise<string>} Pasted text
   */
  const pasteWithFeedback = async (feedbackCallback = null) => {
    const text = await pasteText()
    
    if (feedbackCallback) {
      feedbackCallback(text ? 'success' : 'error', {
        text,
        error: pasteError.value
      })
    }
    
    return text
  }

  /**
   * Get the last pasted text
   * @returns {string} Last pasted text
   */
  const getLastPastedText = () => {
    return lastPastedText.value
  }

  /**
   * Clear paste history and error state
   */
  const clearPasteState = () => {
    lastPastedText.value = ''
    pasteError.value = null
  }

  /**
   * Check if paste is supported
   * @returns {boolean} Whether paste is supported
   */
  const isPasteSupported = () => {
    return !!(navigator.clipboard?.readText)
  }

  /**
   * Start monitoring clipboard content
   */
  const startClipboardMonitoring = () => {
    if (clipboardMonitorInterval) return

    // Check immediately
    checkClipboardContent()

    // Check periodically (respecting browser limitations)
    clipboardMonitorInterval = setInterval(async () => {
      // Only check when document is focused to avoid unnecessary permission prompts
      if (document.hasFocus()) {
        await checkClipboardContent()
      }
    }, 3000) // Check every 3 seconds when focused

    logger.debug('[usePasteAction] Clipboard monitoring started')
  }

  /**
   * Stop monitoring clipboard content
   */
  const stopClipboardMonitoring = () => {
    if (clipboardMonitorInterval) {
      clearInterval(clipboardMonitorInterval)
      clipboardMonitorInterval = null
      logger.debug('[usePasteAction] Clipboard monitoring stopped')
    }
  }

  /**
   * Handle focus events for clipboard monitoring
   */
  const handleFocus = () => {
    checkClipboardContent()
  }

  // Lifecycle
  onMounted(() => {
    startClipboardMonitoring()
    document.addEventListener('focus', handleFocus, true)
  })

  onUnmounted(() => {
    stopClipboardMonitoring()
    document.removeEventListener('focus', handleFocus, true)
  })

  return {
    // State
    isPasting,
    hasClipboardContent,
    lastPastedText,
    pasteError,
    
    // Methods
    pasteText,
    pasteWithFeedback,
    pasteTextFallback,
    checkClipboardContent,
    getLastPastedText,
    clearPasteState,
    isPasteSupported,
    startClipboardMonitoring,
    stopClipboardMonitoring
  }
}
