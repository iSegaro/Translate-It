import { onBeforeUnmount, ref } from 'vue'
import { pageEventBus } from '@/core/PageEventBus.js'
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js'
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { TranslationMode } from '@/shared/config/config.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfSelectionAction')

export function usePdfSelectionAction() {
  const isSelected = ref(false)
  const selectedText = ref('')
  const selectionPosition = ref(null)
  const isTranslating = ref(false)
  const translatedText = ref('')
  const translationError = ref('')

  let selectionHandler = null
  let clearHandler = null

  function onSelectionChange(detail) {
    if (!detail?.text || !detail?.position) {
      isSelected.value = false
      return
    }

    const text = detail.text.trim()
    if (!text) {
      isSelected.value = false
      return
    }

    selectedText.value = text
    selectionPosition.value = detail.position
    isSelected.value = true
    translatedText.value = ''
    translationError.value = ''
  }

  function onSelectionClear() {
    isSelected.value = false
    selectedText.value = ''
    selectionPosition.value = null
    translatedText.value = ''
    translationError.value = ''
  }

  function start() {
    if (selectionHandler) return

    selectionHandler = onSelectionChange
    clearHandler = onSelectionClear
    pageEventBus.on(SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, selectionHandler)
    pageEventBus.on(SELECTION_EVENTS.GLOBAL_SELECTION_CLEAR, clearHandler)
    logger.debug('PDF selection action adapter started')
  }

  function stop() {
    if (selectionHandler) {
      pageEventBus.off(SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, selectionHandler)
      pageEventBus.off(SELECTION_EVENTS.GLOBAL_SELECTION_CLEAR, clearHandler)
      selectionHandler = null
      clearHandler = null
    }
    isSelected.value = false
    selectedText.value = ''
    selectionPosition.value = null
    translatedText.value = ''
    translationError.value = ''
    isTranslating.value = false
  }

  async function translateSelection() {
    if (!selectedText.value || isTranslating.value) return

    const textToSend = selectedText.value
    translatedText.value = ''
    translationError.value = ''

    try {
      isTranslating.value = true

      const response = await sendRegularMessage({
        action: MessageActions.TRANSLATE,
        data: {
          text: textToSend,
          mode: TranslationMode.Selection
        }
      })

      if (response?.success && response?.translatedText) {
        translatedText.value = response.translatedText
      } else {
        translationError.value = response?.error?.message || 'Translation failed'
      }
    } catch (error) {
      logger.error('PDF selection translation failed:', error)
      translationError.value = error?.message || 'Translation failed'
    } finally {
      isTranslating.value = false
    }
  }

  function dismiss() {
    onSelectionClear()
  }

  onBeforeUnmount(() => {
    stop()
  })

  return {
    isSelected,
    selectedText,
    selectionPosition,
    isTranslating,
    translatedText,
    translationError,
    start,
    stop,
    translateSelection,
    dismiss
  }
}
