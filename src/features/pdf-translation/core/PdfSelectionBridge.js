import { unref } from 'vue'
import ResourceTracker from '@/core/memory/ResourceTracker.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js'
import { SelectionTranslationMode } from '@/shared/config/config.js'
import settingsManager from '@/shared/managers/SettingsManager.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { buildPdfSelectionPayload, isSelectionInsidePdfTextLayer } from './PdfSelectionUtils.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfSelectionBridge')

export class PdfSelectionBridge extends ResourceTracker {
  constructor(viewerRootRef) {
    super('pdf-selection-bridge')
    this.viewerRootRef = viewerRootRef
    this.lastSelectionSignature = ''
    this.isStarted = false
    this.isPointerDown = false
    this.hasPendingSelectionChange = false
    this._documentListenerOptions = { capture: true }
    this._windowListenerOptions = { capture: true }
    this.handleSelectionChange = this.handleSelectionChange.bind(this)
    this.handlePointerDown = this.handlePointerDown.bind(this)
    this.handlePointerUp = this.handlePointerUp.bind(this)
    this.handlePointerCancel = this.handlePointerCancel.bind(this)
    this.handleWindowBlur = this.handleWindowBlur.bind(this)
  }

  get viewerRoot() {
    return unref(this.viewerRootRef) || null
  }

  start() {
    if (this.isStarted || typeof document === 'undefined') return

    this.isStarted = true
    this.addEventListener(document, 'selectionchange', this.handleSelectionChange, this._documentListenerOptions)
    this.addEventListener(document, 'pointerdown', this.handlePointerDown, this._documentListenerOptions)
    this.addEventListener(document, 'pointerup', this.handlePointerUp, this._documentListenerOptions)
    this.addEventListener(document, 'pointercancel', this.handlePointerCancel, this._documentListenerOptions)
    this.addEventListener(window, 'blur', this.handleWindowBlur, this._windowListenerOptions)
    logger.debug('PDF selection bridge started')
  }

  stop() {
    if (!this.isStarted) return

    this.removeEventListener(document, 'selectionchange', this.handleSelectionChange, this._documentListenerOptions)
    this.removeEventListener(document, 'pointerdown', this.handlePointerDown, this._documentListenerOptions)
    this.removeEventListener(document, 'pointerup', this.handlePointerUp, this._documentListenerOptions)
    this.removeEventListener(document, 'pointercancel', this.handlePointerCancel, this._documentListenerOptions)
    this.removeEventListener(window, 'blur', this.handleWindowBlur, this._windowListenerOptions)
    this.cleanup()
    this.isStarted = false
    logger.debug('PDF selection bridge stopped')
  }

  handlePointerDown(event) {
    const target = event?.target
    const viewerRoot = this.viewerRoot

    if (!viewerRoot || !target || !viewerRoot.contains(target)) {
      return
    }

    this.isPointerDown = true
    this.hasPendingSelectionChange = false
  }

  handlePointerUp() {
    if (!this.isPointerDown) {
      return
    }

    this.isPointerDown = false

    if (!this.hasPendingSelectionChange) {
      return
    }

    this.hasPendingSelectionChange = false
    this.handleSelectionChange()
  }

  handlePointerCancel() {
    this.isPointerDown = false
    this.hasPendingSelectionChange = false
  }

  handleWindowBlur() {
    this.isPointerDown = false
    this.hasPendingSelectionChange = false
    this.clearSelection('window-blur')
  }

  handleSelectionChange() {
    const viewerRoot = this.viewerRoot
    const selection = document.getSelection?.()

    if (this.isPointerDown) {
      this.hasPendingSelectionChange = true
      return
    }

    if (!isSelectionInsidePdfTextLayer(selection, viewerRoot)) {
      this.clearSelection('selection-empty')
      return
    }

    const payload = buildPdfSelectionPayload(selection, viewerRoot)
    if (!payload) {
      this.clearSelection('selection-empty')
      return
    }

    const signature = this._createSignature(payload)
    if (signature === this.lastSelectionSignature) {
      return
    }

    this.lastSelectionSignature = signature
    pageEventBus.emit(SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, {
      text: payload.text,
      position: payload.position,
      mode: settingsManager.get('selectionTranslationMode', SelectionTranslationMode.ON_CLICK),
      options: {},
      context: {
        source: 'pdf-viewer',
        isPdf: true
      }
    })
  }

  clearSelection(reason = 'selection-empty') {
    this.isPointerDown = false
    this.hasPendingSelectionChange = false

    if (!this.lastSelectionSignature) return

    this.lastSelectionSignature = ''
    pageEventBus.emit(SELECTION_EVENTS.GLOBAL_SELECTION_CLEAR, {
      reason,
      context: {
        source: 'pdf-viewer',
        isPdf: true
      }
    })
  }

  _createSignature(payload) {
    const { text, position } = payload
    return [
      text,
      position.x.toFixed(2),
      position.y.toFixed(2),
      position.width.toFixed(2),
      position.height.toFixed(2)
    ].join('|')
  }

  destroy() {
    this.stop()
    super.destroy()
  }
}
