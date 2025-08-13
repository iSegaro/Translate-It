// src/composables/actions/useTextActions.js
// Main unified text actions composable

import { computed } from 'vue'
import { useCopyAction } from './useCopyAction.js'
import { usePasteAction } from './usePasteAction.js'
import { useTTSAction } from './useTTSAction.js'
import { createLogger } from '@/utils/core/logger.js'

const logger = createLogger('Composables', 'useTextActions')

export function useTextActions(options = {}) {
  // Default options
  const opts = {
    enableCopy: true,
    enablePaste: true,
    enableTTS: true,
    showNotifications: true,
    ...options
  }

  // Initialize individual composables
  const copyAction = opts.enableCopy ? useCopyAction() : null
  const pasteAction = opts.enablePaste ? usePasteAction() : null
  const ttsAction = opts.enableTTS ? useTTSAction() : null

  // Combined state
  const isLoading = computed(() => {
    return (
      (copyAction?.isCopying.value || false) ||
      (pasteAction?.isPasting.value || false) ||
      (ttsAction?.isPlaying.value || false)
    )
  })

  const hasError = computed(() => {
    return !!(
      copyAction?.copyError.value ||
      pasteAction?.pasteError.value ||
      ttsAction?.ttsError.value
    )
  })

  const lastError = computed(() => {
    return (
      copyAction?.copyError.value ||
      pasteAction?.pasteError.value ||
      ttsAction?.ttsError.value ||
      null
    )
  })

  // Copy methods
  const copyText = async (text) => {
    if (!copyAction) {
      logger.warn('[useTextActions] Copy not enabled')
      return false
    }
    return await copyAction.copyText(text)
  }

  const copyWithNotification = async (text, notificationCallback = null) => {
    const success = await copyText(text)
    
    if (opts.showNotifications && notificationCallback) {
      notificationCallback(success ? 'success' : 'error', {
        action: 'copy',
        text: success ? text : '',
        error: copyAction?.copyError.value
      })
    }
    
    return success
  }

  // Paste methods
  const pasteText = async () => {
    if (!pasteAction) {
      logger.warn('[useTextActions] Paste not enabled')
      return ''
    }
    return await pasteAction.pasteText()
  }

  const pasteWithNotification = async (notificationCallback = null) => {
    const text = await pasteText()
    
    if (opts.showNotifications && notificationCallback) {
      notificationCallback(text ? 'success' : 'error', {
        action: 'paste',
        text,
        error: pasteAction?.pasteError.value
      })
    }
    
    return text
  }

  // TTS methods
  const speakText = async (text, language = 'auto') => {
    if (!ttsAction) {
      logger.warn('[useTextActions] TTS not enabled')
      return false
    }
    return await ttsAction.speak(text, language)
  }

  const stopSpeaking = async () => {
    if (!ttsAction) return true
    return await ttsAction.stop()
  }

  // Combined actions
  const copyAndSpeak = async (text, language = 'auto', notificationCallback = null) => {
    const copySuccess = await copyWithNotification(text, notificationCallback)
    if (copySuccess && ttsAction) {
      await speakText(text, language)
    }
    return copySuccess
  }

  const pasteAndSpeak = async (language = 'auto', notificationCallback = null) => {
    const text = await pasteWithNotification(notificationCallback)
    if (text && ttsAction) {
      await speakText(text, language)
    }
    return text
  }

  // Utility methods
  const clearAllStates = () => {
    copyAction?.clearCopyState()
    pasteAction?.clearPasteState()
    if (ttsAction?.isPlaying.value) {
      stopSpeaking()
    }
  }

  const checkSupport = () => {
    return {
      copy: copyAction?.isCopySupported() || false,
      paste: pasteAction?.isPasteSupported() || false,
      tts: ttsAction?.isTTSSupported() || false
    }
  }

  // Action factory for toolbar usage
  const createActionHandlers = (config = {}) => {
    return {
      onCopy: async (text) => {
        return await copyWithNotification(text, config.notificationCallback)
      },
      
      onPaste: async () => {
        return await pasteWithNotification(config.notificationCallback)
      },
      
      onTTS: async (text, language) => {
        return await speakText(text, language)
      },
      
      onStopTTS: async () => {
        return await stopSpeaking()
      }
    }
  }

  return {
    // State
    isLoading,
    hasError,
    lastError,

    // Individual states (if enabled)
    isCopying: copyAction?.isCopying,
    isPasting: pasteAction?.isPasting,
    isPlaying: ttsAction?.isPlaying,
    hasClipboardContent: pasteAction?.hasClipboardContent,

    // Copy methods
    copyText,
    copyWithNotification,
    canCopy: copyAction?.isCopySupported(),

    // Paste methods
    pasteText,
    pasteWithNotification,
    canPaste: pasteAction?.isPasteSupported(),

    // TTS methods
    speakText,
    stopSpeaking,
    canSpeak: ttsAction?.isTTSSupported(),

    // Combined actions
    copyAndSpeak,
    pasteAndSpeak,

    // Utilities
    clearAllStates,
    checkSupport,
    createActionHandlers,

    // Individual composables (for advanced usage)
    copyAction,
    pasteAction,
    ttsAction
  }
}
