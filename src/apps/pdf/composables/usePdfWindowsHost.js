import { computed, nextTick, onMounted, onUnmounted, ref, unref, watch } from 'vue'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { MessageContexts, MessageFormat } from '@/shared/messaging/core/MessagingCore.js'
import {
  TranslationMode,
  getEffectiveProviderAsync,
  getSourceLanguageAsync,
  getTargetLanguageAsync
} from '@/shared/config/config.js'
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { SimpleMarkdown, ExtractionStrategy } from '@/shared/utils/text/markdown.js'
import { loadPdfWindowLayout, savePdfWindowLayout, savePdfWindowPosition } from './usePdfWindowPersistence.js'
import { usePdfWindowDocking } from './usePdfWindowDocking.js'
import { usePdfWindowDrag } from './usePdfWindowDrag.js'
import { usePdfWindowPlacement } from './usePdfWindowPlacement.js'
import { AUTO_DETECT_VALUE } from '@/shared/constants/core.js'
import { getLanguageNameFromCode } from '@/shared/config/languageConstants.js'
import { buildPdfSelectionIconStyle, getViewportSize } from '@/apps/pdf/utils/pdfWindowGeometry.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfWindowsHost')
const COPY_FEEDBACK_TIMEOUT_MS = 1200

function isPdfSelectionContext(context) {
  if (!context) return false

  if (typeof context === 'string') {
    return context === 'pdf-viewer' || context === 'pdf-translation'
  }

  return context.source === 'pdf-viewer' || context.isPdf === true
}

function resolveLanguageDisplayName(code) {
  if (typeof code !== 'string') {
    return ''
  }

  const normalizedCode = code.trim()
  if (!normalizedCode || normalizedCode.toLowerCase() === AUTO_DETECT_VALUE) {
    return ''
  }

  const languageName = getLanguageNameFromCode(normalizedCode)
  if (!languageName) {
    return ''
  }

  const normalizedName = languageName.trim().toLowerCase()
  if (!normalizedName || normalizedName === normalizedCode.toLowerCase()) {
    return ''
  }

  return languageName.charAt(0).toUpperCase() + languageName.slice(1)
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

export function usePdfWindowsHost(options = {}) {
  const tracker = useResourceTracker('pdf-windows-host')
  const pdfFingerprintSource = options.pdfFingerprint ?? ref('')

  const hostRef = ref(null)
  const toolbarRef = ref(null)
  const selectionIconRef = ref(null)
  const isVisible = ref(false)
  const selectedText = ref('')
  const selectionPosition = ref(null)
  const translatedText = ref('')
  const translationError = ref('')
  const isTranslating = ref(false)
  const isCopying = ref(false)
  const copyStatus = ref('')
  const selectedProvider = ref('')
  const isProviderReady = ref(false)
  const showOriginal = ref(false)
  const detectedSourceLanguage = ref('')
  const isIconVisible = ref(false)
  const isIconTransitionPending = ref(false)
  const translationMode = ref(TranslationMode.Selection)
  const translationTargetLanguage = ref(AUTO_DETECT_VALUE)
  const selectionSessionId = ref(0)
  const hostStyle = ref({})
  const viewportTick = ref(0)
  const isInternalHostInteraction = ref(false)

  const placement = usePdfWindowPlacement()
  const docking = usePdfWindowDocking({
    initialPinned: false,
    initialDockMode: 'none',
    initialDockedWidth: 420
  })

  let cleanupRegistered = false
  let activeRequestSessionId = 0
  let listenerId = 0
  let copyFeedbackTimeoutId = null
  let internalHostInteractionResetTimerId = null

  const hasTranslatedResult = computed(() => !!translatedText.value)
  const hasError = computed(() => !!translationError.value)
  const speakableText = computed(() => (
    showOriginal.value
      ? selectedText.value
      : translatedText.value || selectedText.value
  ))
  const hasSpeakableText = computed(() => !!speakableText.value?.trim())
  const isDictionaryResult = computed(() => (
    translationMode.value === TranslationMode.Dictionary_Translation
    || translationMode.value === TranslationMode.LEGACY_DICTIONARY
  ))
  const detectedLanguageName = computed(() => {
    return resolveLanguageDisplayName(detectedSourceLanguage.value)
  })
  const targetLanguageName = computed(() => {
    return resolveLanguageDisplayName(translationTargetLanguage.value)
  })
  const iconStyle = computed(() => (
    isIconVisible.value
      ? (viewportTick.value, buildPdfSelectionIconStyle(selectionPosition.value, getViewportSize()))
      : {}
  ))
  const translatedDisplayMetadata = computed(() => (
    hasTranslatedResult.value
      ? { mode: translationMode.value, targetLanguage: translationTargetLanguage.value }
      : null
  ))

  function resolvePdfFingerprint() {
    const fingerprint = unref(pdfFingerprintSource)
    return typeof fingerprint === 'string' ? fingerprint.trim() : ''
  }

  function clearCopyFeedback() {
    if (copyFeedbackTimeoutId !== null) {
      tracker.clearTimer(copyFeedbackTimeoutId)
      copyFeedbackTimeoutId = null
    }

    copyStatus.value = ''
  }

  async function hydrateSelectedProvider() {
    const provider = await getEffectiveProviderAsync(TranslationMode.PDF)

    if (!selectedProvider.value && provider) {
      selectedProvider.value = provider
    }

    isProviderReady.value = true
    return selectedProvider.value || provider
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

  function refreshHostStyle() {
    if (!isVisible.value) {
      hostStyle.value = {}
      return
    }

    placement.measureHostSize(hostRef.value)
    hostStyle.value = placement.buildCurrentStyle({
      dockMode: docking.dockMode.value,
      dockedWidth: docking.dockedWidth.value
    })
  }

  async function scheduleHostStyleRefresh() {
    await nextTick()
    refreshHostStyle()
  }

  function hideIconStage() {
    isIconVisible.value = false
  }

  function clearIconTransitionPending() {
    isIconTransitionPending.value = false
  }

  function clearInternalHostInteraction() {
    if (internalHostInteractionResetTimerId !== null) {
      tracker.clearTimer(internalHostInteractionResetTimerId)
      internalHostInteractionResetTimerId = null
    }

    isInternalHostInteraction.value = false
  }

  function markInternalHostInteraction() {
    if (internalHostInteractionResetTimerId !== null) {
      tracker.clearTimer(internalHostInteractionResetTimerId)
      internalHostInteractionResetTimerId = null
    }

    isInternalHostInteraction.value = true
  }

  function markDropdownInteraction() {
    markInternalHostInteraction()
    scheduleInternalHostInteractionClear()
  }

  function scheduleInternalHostInteractionClear() {
    if (!isInternalHostInteraction.value) {
      return
    }

    if (internalHostInteractionResetTimerId !== null) {
      tracker.clearTimer(internalHostInteractionResetTimerId)
    }

    internalHostInteractionResetTimerId = tracker.trackTimeout(() => {
      isInternalHostInteraction.value = false
      internalHostInteractionResetTimerId = null
    }, 0)
  }

  function handleIconPointerDown() {
    if (!isIconVisible.value) {
      return
    }

    isIconTransitionPending.value = true
  }

  function stopSelectionIconTTS() {
    return selectionIconRef.value?.stopSelectionTTS?.()
  }

  function stopWindowTTS() {
    return toolbarRef.value?.stopTTS?.()
  }

  function clearWindowContent() {
    translatedText.value = ''
    translationError.value = ''
    detectedSourceLanguage.value = ''
    isTranslating.value = false
    isCopying.value = false
    showOriginal.value = false
    translationMode.value = TranslationMode.Selection
    translationTargetLanguage.value = AUTO_DETECT_VALUE
    clearCopyFeedback()
    activeRequestSessionId = 0
  }

  function hideWindowStage({ stopTTS = true } = {}) {
    if (stopTTS) {
      void stopWindowTTS()
    }
    isVisible.value = false
    clearWindowContent()
    hostStyle.value = {}
  }

  function resetVisibleState() {
    selectedText.value = ''
    selectionPosition.value = null
    hideIconStage()
    hideWindowStage()
    clearIconTransitionPending()
    clearInternalHostInteraction()
  }

  function toggleShowOriginal() {
    showOriginal.value = !showOriginal.value
  }

  async function handleProviderChange(nextProvider) {
    const normalizedProvider = typeof nextProvider === 'string' ? nextProvider.trim() : ''
    if (!normalizedProvider || normalizedProvider === selectedProvider.value) {
      return
    }

    markDropdownInteraction()
    selectedProvider.value = normalizedProvider
    selectionSessionId.value += 1
    activeRequestSessionId = 0
    translatedText.value = ''
    translationError.value = ''
    detectedSourceLanguage.value = ''
    isTranslating.value = false
    translationMode.value = TranslationMode.Selection
    translationTargetLanguage.value = AUTO_DETECT_VALUE
    clearCopyFeedback()

    if (isVisible.value && selectedText.value) {
      await translateSelection()
    }
  }

  function shouldTranslateDirectlyOnSelection() {
    return isVisible.value && (docking.isDocked.value || docking.isPinned.value)
  }

  function showIconForSelection(position) {
    hideWindowStage({ stopTTS: false })
    isIconVisible.value = true
    placement.setSelectionPosition(position, { followSelection: true })
  }

  async function showWindowForSelection(position, { translateImmediately = false, anchorToSelection = false } = {}) {
    hideIconStage()
    clearWindowContent()
    isVisible.value = true
    if (anchorToSelection) {
      placement.resetManualPosition()
    }
    placement.setSelectionPosition(position, {
      followSelection: !placement.manualPosition.value
    })
    await scheduleHostStyleRefresh()

    if (translateImmediately) {
      await translateSelection()
    }
  }

  async function openWindowFromIcon() {
    if (!isIconVisible.value || !selectedText.value) {
      return false
    }

    isIconTransitionPending.value = true

    try {
      await showWindowForSelection(selectionPosition.value, {
        translateImmediately: true,
        anchorToSelection: true
      })
      return true
    } finally {
      clearIconTransitionPending()
    }
  }

  async function persistGlobalPreferences() {
    const fingerprint = resolvePdfFingerprint()
    await savePdfWindowLayout({
      pdfFingerprint: fingerprint,
      isPinned: docking.isPinned.value,
      dockMode: docking.dockMode.value,
      dockedWidth: docking.dockedWidth.value
    })
  }

  async function persistCurrentPosition() {
    if (docking.dockMode.value !== 'none') {
      return
    }

    const fingerprint = resolvePdfFingerprint()
    await savePdfWindowPosition(fingerprint, placement.position.value)
  }

  async function hydrateLayoutState() {
    const fingerprint = resolvePdfFingerprint()
    const layout = await loadPdfWindowLayout(fingerprint)

    docking.setPinned(layout.isPinned)
    docking.setDockMode(layout.dockMode)
    docking.setDockedWidth(layout.dockedWidth)

    placement.setFloatingPosition(layout.position, { markManual: false })
    if (layout.hasDocumentPosition || !fingerprint) {
      placement.markManualPosition()
    } else {
      placement.resetManualPosition()
    }

    await scheduleHostStyleRefresh()
  }

  function dismissHost() {
    selectionSessionId.value += 1
    activeRequestSessionId = 0
    void stopSelectionIconTTS()

    if (isVisible.value && docking.dockMode.value === 'none') {
      void persistCurrentPosition()
    }

    resetVisibleState()
  }

  function isPdfSelectionEvent(detail) {
    return isPdfSelectionContext(detail?.context)
  }

  async function handlePinToggle() {
    docking.togglePin()
    placement.markManualPosition()
    await persistGlobalPreferences()
    await scheduleHostStyleRefresh()
  }

  async function handleDockResize(event) {
    const started = docking.startResize(event, {
      onResize: () => {
        void scheduleHostStyleRefresh()
      },
      onResizeEnd: async () => {
        await persistGlobalPreferences()
        await scheduleHostStyleRefresh()
      }
    })

    if (started) {
      placement.markManualPosition()
    }

    return started
  }

  function handleSelectionChange(detail) {
    if (!isPdfSelectionEvent(detail)) {
      return
    }

    const text = typeof detail?.text === 'string' ? detail.text.trim() : ''
    const position = detail?.position || null

    if (!text || !position) {
      if (isVisible.value && docking.isPinned.value) {
        return
      }

      dismissHost()
      return
    }

    selectionSessionId.value += 1
    activeRequestSessionId = 0
    void stopSelectionIconTTS()
    void stopWindowTTS()

    selectedText.value = text
    selectionPosition.value = position
    hideIconStage()

    if (shouldTranslateDirectlyOnSelection()) {
      void showWindowForSelection(position, { translateImmediately: true })
      return
    }

    showIconForSelection(position)
  }

  function handleSelectionClear(detail) {
    if (!isPdfSelectionContext(detail?.context)) {
      return
    }

    if (detail?.reason === 'window-blur' && isVisible.value) {
      return
    }

    if (isIconTransitionPending.value) {
      return
    }

    const activeElement = typeof document !== 'undefined' ? document.activeElement : null
    if (isVisible.value && hostRef.value?.contains(activeElement)) {
      return
    }

    if (isInternalHostInteraction.value) {
      return
    }

    if (isVisible.value && docking.isPinned.value) {
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

    let resolvedTargetLanguage = AUTO_DETECT_VALUE
    const [provider, sourceLanguage, targetLanguage] = await Promise.all([
      selectedProvider.value ? Promise.resolve(selectedProvider.value) : getEffectiveProviderAsync(TranslationMode.PDF),
      getSourceLanguageAsync(),
      getTargetLanguageAsync()
    ])

    resolvedTargetLanguage = targetLanguage || AUTO_DETECT_VALUE

    if (!selectedProvider.value && provider) {
      selectedProvider.value = provider
    }

    const requestSessionId = selectionSessionId.value
    activeRequestSessionId = requestSessionId

    isTranslating.value = true
    translationError.value = ''
    translatedText.value = ''
    detectedSourceLanguage.value = ''
    translationTargetLanguage.value = resolvedTargetLanguage
    clearCopyFeedback()

    try {
      const response = await sendRegularMessage(
        MessageFormat.create(
          MessageActions.TRANSLATE,
          {
            text: normalizedText,
            provider,
            sourceLanguage: sourceLanguage || AUTO_DETECT_VALUE,
            targetLanguage,
            // PDF selection uses the standard selection route, but provider resolution stays PDF-specific.
            mode: TranslationMode.Selection,
            isExplicitProvider: true
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
        detectedSourceLanguage.value = normalizeDetectedSourceLanguage(
          response?.detectedSourceLanguage ?? response?.sourceLanguage
        )
        translationMode.value = response?.mode || response?.translationMode || TranslationMode.Selection
        isProviderReady.value = true
        return true
      }

      translationError.value = response?.error?.message || response?.message || 'Translation failed'
      translatedText.value = ''
      detectedSourceLanguage.value = ''
      translationTargetLanguage.value = resolvedTargetLanguage
      return false
    } catch (error) {
      if (requestSessionId !== selectionSessionId.value || activeRequestSessionId !== requestSessionId) {
        return false
      }

      logger.error('PDF selection translation failed:', error)
      translationError.value = error?.message || 'Translation failed'
      translatedText.value = ''
      detectedSourceLanguage.value = ''
      translationTargetLanguage.value = resolvedTargetLanguage
      translationMode.value = TranslationMode.Selection
      return false
    } finally {
      if (activeRequestSessionId === requestSessionId) {
        isTranslating.value = false
        activeRequestSessionId = 0
      }
    }
  }

  function normalizeDetectedSourceLanguage(code) {
    if (typeof code !== 'string') {
      return ''
    }

    const normalizedCode = code.trim()
    if (!normalizedCode || normalizedCode.toLowerCase() === AUTO_DETECT_VALUE) {
      return ''
    }

    const languageName = getLanguageNameFromCode(normalizedCode)
    if (!languageName || languageName.toLowerCase() === AUTO_DETECT_VALUE) {
      return ''
    }

    if (languageName.trim().toLowerCase() === normalizedCode.toLowerCase()) {
      return ''
    }

    return normalizedCode
  }

  async function retryTranslation() {
    return translateSelection()
  }

  async function copyTranslation() {
    if (!translatedText.value || isCopying.value) {
      return false
    }

    isCopying.value = true

    try {
      const textToCopy = isDictionaryResult.value
        ? SimpleMarkdown.getCleanTranslation(translatedText.value, ExtractionStrategy.CLEAN_DICT)
        : SimpleMarkdown.getCleanTranslation(translatedText.value, ExtractionStrategy.FULL_TEXT)
      const success = await copyTextToClipboard(textToCopy)
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
    if (event.key === 'Escape' && (isVisible.value || isIconVisible.value)) {
      dismissHost()
    }
  }

  function handleDocumentPointerDown(event) {
    if (!isVisible.value && !isIconVisible.value) {
      return
    }

    if (isVisible.value && docking.isPinned.value) {
      return
    }

    const root = hostRef.value
    const iconRoot = iconHostRef.value
    const isInsideIcon = iconRoot && iconRoot.contains(event.target)
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : []
    const isProviderDropdownInteraction = path.some((node) => {
      if (!(node instanceof HTMLElement)) {
        return false
      }

      return node.classList.contains('ti-provider-dropdown-menu')
        || node.classList.contains('ti-provider-dropdown-list')
        || node.classList.contains('ti-dropdown-item')
        || node.classList.contains('ti-set-default-btn')
    })

    if ((root && root.contains(event.target)) || isInsideIcon || isProviderDropdownInteraction) {
      if (isProviderDropdownInteraction) {
        markDropdownInteraction()
      }

      return
    }

    if (isVisible.value || isIconVisible.value) {
      dismissHost()
    }
  }

  function handleViewportChange() {
    if (isIconVisible.value) {
      viewportTick.value += 1
    }

    if (isVisible.value) {
      placement.ensurePositionWithinViewport()
      void scheduleHostStyleRefresh()
    }
  }

  function handleHostPointerDown() {
    if (!isVisible.value) {
      return
    }

    markInternalHostInteraction()
  }

  function handleHostPointerUp() {
    scheduleInternalHostInteractionClear()
  }

  function handleHostPointerCancel() {
    clearInternalHostInteraction()
  }

  const iconHostRef = ref(null)

  const drag = usePdfWindowDrag({
    tracker,
    hostRef,
    position: placement.position,
    hostSize: placement.hostSize,
    dockMode: docking.dockMode,
    manualPosition: placement.manualPosition,
    onDockModeChange: async (mode) => {
      docking.setDockMode(mode)
      placement.markManualPosition()
      await persistGlobalPreferences()
      await scheduleHostStyleRefresh()
    },
    onPositionChange: () => {
      void scheduleHostStyleRefresh()
    },
    onPersistPosition: async (nextPosition) => {
      placement.setFloatingPosition(nextPosition, { markManual: true })
      await persistCurrentPosition()
    },
    onDragStart: () => {
      placement.markManualPosition()
    },
    onDragEnd: () => {
      void scheduleHostStyleRefresh()
    }
  })

  watch(
    () => resolvePdfFingerprint(),
    async (newFingerprint, oldFingerprint) => {
      if (newFingerprint === oldFingerprint) {
        return
      }

      dismissHost()
      await hydrateLayoutState()
      await hydrateSelectedProvider()
    },
    { immediate: true }
  )

  watch(
    [
      isVisible,
      selectionPosition,
      translatedText,
      translationError,
      () => docking.isPinned.value,
      () => docking.dockMode.value,
      () => docking.dockedWidth.value,
      () => placement.manualPosition.value
    ],
    () => {
      void scheduleHostStyleRefresh()
    },
    { deep: true }
  )

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

  onUnmounted(() => {
    void stopWindowTTS()
    void stopSelectionIconTTS()
  })

  return {
    iconHostRef,
    toolbarRef,
    selectionIconRef,
    isIconVisible,
    iconStyle,
    hostRef,
    hostStyle,
    isVisible,
    selectedText,
    selectedProvider,
    isProviderReady,
    showOriginal,
    detectedSourceLanguage,
    detectedLanguageName,
    targetLanguageName,
    translatedText,
    translationError,
    isTranslating,
    isCopying,
    copyStatus,
    hasTranslatedResult,
    hasError,
    speakableText,
    hasSpeakableText,
    isDictionaryResult,
    translationTargetLanguage,
    translatedDisplayMetadata,
    isPinned: docking.isPinned,
    dockMode: docking.dockMode,
    dockedWidth: docking.dockedWidth,
    isDocked: docking.isDocked,
    isResizing: docking.isResizing,
    isDragging: drag.isDragging,
    translateSelection,
    retryTranslation,
    copyTranslation,
    dismissHost,
    openWindowFromIcon,
    handleIconPointerDown,
    handleHostPointerDown,
    handleHostPointerUp,
    handleHostPointerCancel,
    toggleShowOriginal,
    handleProviderChange,
    handlePinToggle,
    handleDockResize,
    startDrag: drag.startDrag,
    refreshHostStyle,
    scheduleHostStyleRefresh
  }
}
