import { computed, onMounted, ref, watch } from 'vue'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { MessageContexts, MessageFormat } from '@/shared/messaging/core/MessagingCore.js'
import { TranslationMode } from '@/shared/config/config.js'
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfWindowsHost')
const PANEL_MARGIN = 12
const DEFAULT_PANEL_WIDTH = 380
const DEFAULT_PANEL_HEIGHT = 240
const COPY_FEEDBACK_TIMEOUT_MS = 1200

function isPdfSelectionContext(context) {
  if (!context) return false

  if (typeof context === 'string') {
    return context === 'pdf-viewer' || context === 'pdf-translation'
  }

  return context.source === 'pdf-viewer' || context.isPdf === true
}

function getViewportPosition(position) {
  if (!position) return null

  if (position._isViewportRelative) {
    return {
      x: Number(position.x ?? position.left ?? 0),
      y: Number(position.y ?? position.top ?? 0),
      width: Number(position.width ?? 0),
      height: Number(position.height ?? 0)
    }
  }

  return {
    x: Number(position.x ?? position.left ?? 0) - (window.scrollX || 0),
    y: Number(position.y ?? position.top ?? 0) - (window.scrollY || 0),
    width: Number(position.width ?? 0),
    height: Number(position.height ?? 0)
  }
}

function buildPanelStyle(position, isExpanded) {
  if (!position) return {}

  const viewportPosition = getViewportPosition(position)
  if (!viewportPosition) return {}

  const viewportWidth = document.documentElement?.clientWidth || window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0
  const panelWidth = Math.min(DEFAULT_PANEL_WIDTH, Math.max(280, viewportWidth - PANEL_MARGIN * 2))
  const panelHeight = isExpanded ? 300 : DEFAULT_PANEL_HEIGHT
  const anchorX = viewportPosition.x + (viewportPosition.width / 2)
  const anchorBelowY = viewportPosition.y + viewportPosition.height + 12
  const anchorAboveY = viewportPosition.y - panelHeight - 12

  let left = anchorX
  let top = anchorBelowY

  const halfWidth = panelWidth / 2
  const maxLeft = Math.max(halfWidth + PANEL_MARGIN, viewportWidth - halfWidth - PANEL_MARGIN)
  left = Math.max(halfWidth + PANEL_MARGIN, Math.min(left, maxLeft))

  if (top + panelHeight + PANEL_MARGIN > viewportHeight) {
    top = Math.max(PANEL_MARGIN, anchorAboveY)
  }

  return {
    left: `${left}px`,
    top: `${Math.max(PANEL_MARGIN, top)}px`,
    width: `${panelWidth}px`
  }
}

async function copyTextToClipboard(text) {
  if (!text) return false

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()

  const success = document.execCommand?.('copy')
  document.body.removeChild(textarea)
  return !!success
}

export function usePdfWindowsHost() {
  const tracker = useResourceTracker('pdf-windows-host')

  const hostRef = ref(null)
  const isVisible = ref(false)
  const selectedText = ref('')
  const selectionPosition = ref(null)
  const translatedText = ref('')
  const translationError = ref('')
  const isTranslating = ref(false)
  const isCopying = ref(false)
  const copyStatus = ref('')
  const selectionSessionId = ref(0)
  const hostStyle = ref({})

  let cleanupRegistered = false
  let activeRequestSessionId = 0
  let listenerId = 0
  let copyFeedbackTimeoutId = null

  const hasTranslatedResult = computed(() => !!translatedText.value)
  const hasError = computed(() => !!translationError.value)
  const canTranslate = computed(() => isVisible.value && !!selectedText.value && !isTranslating.value)

  function refreshHostStyle() {
    if (!isVisible.value || !selectionPosition.value) {
      hostStyle.value = {}
      return
    }

    hostStyle.value = buildPanelStyle(selectionPosition.value, hasTranslatedResult.value || hasError.value)
  }

  function clearCopyFeedback() {
    if (copyFeedbackTimeoutId !== null) {
      tracker.clearTimer(copyFeedbackTimeoutId)
      copyFeedbackTimeoutId = null
    }
    copyStatus.value = ''
  }

  function setCopyStatus(status) {
    copyStatus.value = status

    if (!status) {
      clearCopyFeedback()
      return
    }

    if (copyFeedbackTimeoutId !== null) {
      tracker.clearTimer(copyFeedbackTimeoutId)
    }

    copyFeedbackTimeoutId = tracker.trackTimeout(() => {
      copyStatus.value = ''
      copyFeedbackTimeoutId = null
    }, COPY_FEEDBACK_TIMEOUT_MS)
  }

  function resetVisibleState() {
    isVisible.value = false
    selectedText.value = ''
    selectionPosition.value = null
    translatedText.value = ''
    translationError.value = ''
    isTranslating.value = false
    isCopying.value = false
    clearCopyFeedback()
    hostStyle.value = {}
  }

  function dismissHost() {
    selectionSessionId.value += 1
    activeRequestSessionId = 0
    resetVisibleState()
  }

  function isPdfSelectionEvent(detail) {
    return isPdfSelectionContext(detail?.context)
  }

  function handleSelectionChange(detail) {
    if (!isPdfSelectionEvent(detail)) {
      return
    }

    const text = typeof detail?.text === 'string' ? detail.text.trim() : ''
    const position = detail?.position || null

    if (!text || !position) {
      dismissHost()
      return
    }

    selectionSessionId.value += 1
    activeRequestSessionId = 0

    isVisible.value = true
    selectedText.value = text
    selectionPosition.value = position
    translatedText.value = ''
    translationError.value = ''
    isTranslating.value = false
    clearCopyFeedback()

    refreshHostStyle()
  }

  function handleSelectionClear(detail) {
    if (!isPdfSelectionContext(detail?.context)) {
      return
    }

    dismissHost()
  }

  function registerListener(target, event, handler, options) {
    const cleanup = () => {
      if (target?.removeEventListener) {
        target.removeEventListener(event, handler, options)
      }
    }

    if (target?.addEventListener) {
      target.addEventListener(event, handler, options)
    }

    tracker.trackResource(`pdf-windows-host:${event}:${listenerId += 1}`, cleanup)
  }

  function registerBusListener(event, handler) {
    const unsubscribe = pageEventBus.on(event, handler)
    tracker.trackResource(`pdf-windows-host:${event}:${listenerId += 1}`, () => {
      unsubscribe?.()
    })
  }

  async function translateSelection(text = selectedText.value) {
    const normalizedText = typeof text === 'string' ? text.trim() : ''
    if (!normalizedText || isTranslating.value) {
      return false
    }

    const requestSessionId = selectionSessionId.value
    activeRequestSessionId = requestSessionId

    isTranslating.value = true
    translationError.value = ''
    translatedText.value = ''
    clearCopyFeedback()

    try {
      const response = await sendRegularMessage(
        MessageFormat.create(
          MessageActions.TRANSLATE,
          {
            text: normalizedText,
            mode: TranslationMode.Selection,
            enableDictionary: false
          },
          MessageContexts.PDF_TRANSLATION
        )
      )

      if (requestSessionId !== selectionSessionId.value || activeRequestSessionId !== requestSessionId) {
        return false
      }

      if (response?.success && typeof response.translatedText === 'string') {
        translatedText.value = response.translatedText
        translationError.value = ''
        return true
      }

      translationError.value = response?.error?.message || response?.message || 'Translation failed'
      translatedText.value = ''
      return false
    } catch (error) {
      if (requestSessionId !== selectionSessionId.value || activeRequestSessionId !== requestSessionId) {
        return false
      }

      logger.error('PDF selection translation failed:', error)
      translationError.value = error?.message || 'Translation failed'
      translatedText.value = ''
      return false
    } finally {
      if (activeRequestSessionId === requestSessionId) {
        isTranslating.value = false
        activeRequestSessionId = 0
      }
    }
  }

  async function retryTranslation() {
    return translateSelection(selectedText.value)
  }

  async function copyTranslation() {
    if (!translatedText.value || isCopying.value) {
      return false
    }

    isCopying.value = true

    try {
      const success = await copyTextToClipboard(translatedText.value)
      setCopyStatus(success ? 'copied' : 'failed')
      return success
    } catch (error) {
      logger.error('Failed to copy translated PDF text:', error)
      setCopyStatus('failed')
      return false
    } finally {
      isCopying.value = false
    }
  }

  function handleEscapeKey(event) {
    if (event.key === 'Escape' && isVisible.value) {
      dismissHost()
    }
  }

  function handleDocumentPointerDown(event) {
    if (!isVisible.value) {
      return
    }

    const root = hostRef.value
    if (root && !root.contains(event.target)) {
      dismissHost()
    }
  }

  function handleViewportChange() {
    if (isVisible.value) {
      refreshHostStyle()
    }
  }

  onMounted(() => {
    if (cleanupRegistered) {
      return
    }

    cleanupRegistered = true
    registerBusListener(SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, handleSelectionChange)
    registerBusListener(SELECTION_EVENTS.GLOBAL_SELECTION_CLEAR, handleSelectionClear)
    registerListener(document, 'keydown', handleEscapeKey, { capture: true })
    registerListener(document, 'pointerdown', handleDocumentPointerDown, { capture: true })
    registerListener(window, 'scroll', handleViewportChange, { capture: true })
    registerListener(window, 'resize', handleViewportChange)
  })

  watch(
    [isVisible, selectionPosition, translatedText, translationError],
    () => {
      refreshHostStyle()
    },
    { deep: true }
  )

  return {
    hostRef,
    hostStyle,
    isVisible,
    selectedText,
    translatedText,
    translationError,
    isTranslating,
    isCopying,
    copyStatus,
    canTranslate,
    hasTranslatedResult,
    hasError,
    translateSelection,
    retryTranslation,
    copyTranslation,
    dismissHost
  }
}
