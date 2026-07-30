import { afterEach, describe, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, reactive, ref } from 'vue'
import PdfApp from './PdfApp.vue'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'
import { PdfDeveloperApi } from './PdfDeveloperApi.js'
import { PDF_REGION_OCR_RENDER_SCALE } from '@/features/pdf-translation/core/pdfRenderingConstants.js'

// jsdom does not implement matchMedia — stub it before component mount
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
}

let mockViewerController
let mockViewerMode
let mockPdfExport
let mockPdfNavigation

let mockPdfOcr
let mockPdfOcrOptions
let mockRegionOcr
let mockRegionOcrOptions
let mockLayoutSyncFromPane
let mockPdfViewport
let mockPdfSession
const mockRegionExecutionDispatch = vi.fn((request, runner) => runner(request))
const openTranslationMock = vi.fn()
const downloadFileMock = vi.hoisted(() => vi.fn())
const openOptionsPageMock = vi.hoisted(() => vi.fn())
const pdfDiagnosticsImportMock = vi.hoisted(() => vi.fn())
const pdfAppLoggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))
const browserTabStateMock = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}))
const settingsStoreMock = vi.hoisted(() => ({
  isDarkTheme: false,
  settings: { THEME: 'auto', DEBUG_MODE: false },
  updateSettingAndPersist: vi.fn().mockResolvedValue(true)
}))
const ocrStoreMock = vi.hoisted(() => ({
  downloadedLanguages: ['eng'],
  init: vi.fn().mockResolvedValue()
}))
const regionComparisonRunnerMock = vi.hoisted(() => ({
  execute: vi.fn(),
  options: null
}))
const activityCompletedMock = vi.hoisted(() => vi.fn(() => ({ name: 'activity-completed' })))
const translationPartialMock = vi.hoisted(() => vi.fn())
const translationFailedMock = vi.hoisted(() => vi.fn())
const pageContentSourceMock = vi.hoisted(() => Object.freeze({
  PDF_TEXT: 'pdf-text',
  OCR: 'ocr',
  NONE: 'none',
  MIXED: 'mixed'
}))

function createMockOperation(promise, cancel = vi.fn(), context = { target: 'ocr' }) {
  return Object.freeze({
    promise,
    cancel,
    context: Object.freeze(context)
  })
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

vi.mock('./composables/usePdfViewerController.js', () => ({
  usePdfViewerController: () => mockViewerController
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => pdfAppLoggerMock,
}))

vi.mock('./utils/PdfBrowserTabState.js', () => browserTabStateMock)

vi.mock('./composables/usePdfViewerMode.js', () => ({
  usePdfViewerMode: () => mockViewerMode,
  CONTENT_VIEW: { ORIGINAL: 'original', TRANSLATION: 'translation', TRANSLATED_PDF: 'translated-pdf' },
  LAYOUT_MODE: { SINGLE: 'single', SIDE_BY_SIDE: 'side-by-side' },
  VIEWER_ROLE: { ORIGINAL: 'original', OVERLAY: 'overlay' }
}))

vi.mock('./composables/usePdfExport.js', () => ({
  usePdfExport: () => mockPdfExport
}))

vi.mock('./composables/usePdfNavigation.js', () => ({
  usePdfNavigation: () => mockPdfNavigation
}))

vi.mock('@/features/pdf-translation/core/PdfDocumentSession.js', () => ({
  pdfDocumentSession: {},
  PAGE_CONTENT_SOURCE: pageContentSourceMock
}))

vi.mock('./presentation/domainEvents.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    DomainEvents: Object.freeze({
      ...actual.DomainEvents,
      activityCompleted: activityCompletedMock,
      translationPartial: (payload) => {
        translationPartialMock(payload)
        return actual.DomainEvents.translationPartial(payload)
      },
      translationFailed: (payload) => {
        translationFailedMock(payload)
        return actual.DomainEvents.translationFailed(payload)
      }
    })
  }
})

vi.mock('./composables/usePdfOcr.js', () => ({
  usePdfOcr: (options) => {
    mockPdfOcrOptions = options
    return mockPdfOcr
  }
}))

vi.mock('./composables/usePdfRegionOcr.js', () => ({
  usePdfRegionOcr: (options) => {
    mockRegionOcrOptions = options
    return mockRegionOcr
  }
}))

vi.mock('./composables/regionExecutionDispatcher.js', () => ({
  createRegionExecutionDispatcher: (options) => {
    return {
      dispatchRegionExecution: (request) => {
        const runner = options.runners?.[request.target]
        if (!runner) throw new RangeError('Unsupported region execution target')
        return mockRegionExecutionDispatch(request, runner)
      }
    }
  }
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => settingsStoreMock
}))

vi.mock('@/features/screen-capture/stores/ocrStore.js', () => ({
  useOCRStore: () => ocrStoreMock
}))

vi.mock('@/features/screen-capture/utils/ocrLanguageMap.js', () => ({
  SUPPORTED_OCR_LANGUAGES: [
    { code: 'eng', name: 'English' },
    { code: 'fas', name: 'Persian' },
    { code: 'deu', name: 'German' },
    { code: 'fra', name: 'French' }
  ],
  getTesseractLanguageCodeLabel: (code) => {
    const map = { eng: 'EN', fas: 'FA', deu: 'DE', fra: 'FR' }
    return map[code] || code?.toUpperCase() || 'EN'
  }
}))

vi.mock('./RegionComparisonRunner.js', () => ({
  RegionComparisonRunner: class {
    constructor(options) {
      regionComparisonRunnerMock.options = options
    }

    execute(request) {
      return regionComparisonRunnerMock.execute(request)
    }
  }
}))

vi.mock('@/utils/ui/theme.js', () => ({
  applyTheme: vi.fn()
}))

vi.mock('@/core/helpers.js', () => ({
  openOptionsPage: openOptionsPageMock
}))

const tMock = vi.fn((key, fallback) => fallback ?? key)

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: tMock })
}))

vi.mock('@/features/pdf-translation/core/PdfFileDownloader.js', () => ({
  downloadFile: downloadFileMock
}))

vi.mock('./components/PdfToolbar.vue', () => ({
  default: {
    name: 'PdfToolbar',
    props: ['fileName', 'pageCount', 'currentPageNumber', 'zoomMode', 'zoomPercent', 'contentView', 'layoutMode', 'executionMode', 'executionModes', 'ocrViewModel', 'regionComparisonState', 'canExportRegionComparisonArtifact', 'hasOutline'],
    emits: ['toggle-outline', 'translate-visible', 'cancel-translation', 'content-view-change', 'layout-mode-change', 'zoom-step', 'zoom-change', 'export-txt', 'export-markdown', 'export-html', 'request-region-comparison', 'cancel-region-comparison', 'export-region-comparison-artifact', 'clear-cache', 'request-open-pdf', 'execution-mode-change', 'primary-click', 'select-action', 'select-language', 'manage-languages', 'open-settings', 'request-document-info', 'previous-page', 'next-page'],
    template: '<header class="pdf-toolbar-stub"><button v-if="hasOutline" class="pdf-toolbar__outline-toggle" /></header>'
  }
}))

vi.mock('./components/PdfDropzone.vue', () => ({
  default: {
    name: 'PdfDropzone',
    props: ['hasDocument'],
    template: '<section class="pdf-dropzone-stub"><slot name="document" /></section>'
  }
}))

vi.mock('./components/PdfViewerLayout.vue', () => ({
  default: {
    name: 'PdfViewerLayout',
    props: ['showOriginalPane', 'showTranslatedPane', 'suppressScrollSync'],
    setup(props, { expose }) {
      const getOriginalPageStep = () => (props.showTranslatedPane ? 100 : 120)
      const translatedPageStep = 100
      const originalCanvasOffset = 24
      const translatedCanvasOffset = 12
      const getOriginalCanvasHeight = () => (getOriginalPageStep() - 48)
      const translatedCanvasHeight = 76

      const original = document.createElement('div')
      const translated = document.createElement('div')
      original.className = 'mock-original-scroll'
      translated.className = 'mock-translated-scroll'
      original.scrollTo = vi.fn(({ top }) => { original.scrollTop = top })
      translated.scrollTo = vi.fn(({ top }) => { translated.scrollTop = top })
      original.getBoundingClientRect = () => ({ top: 0, bottom: 500, height: 500, left: 0, right: 300, width: 300 })
      translated.getBoundingClientRect = () => ({ top: 0, bottom: 500, height: 500, left: 0, right: 300, width: 300 })

      for (let pageNumber = 1; pageNumber <= 12; pageNumber++) {
        const originalPage = document.createElement('div')
        originalPage.className = 'pdf-page'
        originalPage.dataset.pageNumber = String(pageNumber)
        originalPage.getBoundingClientRect = () => {
          const pageStep = getOriginalPageStep()
          const top = ((pageNumber - 1) * pageStep) - original.scrollTop
          return { top, bottom: top + pageStep, height: pageStep, left: 0, right: 300, width: 300 }
        }
        const originalCanvas = document.createElement('canvas')
        originalCanvas.getBoundingClientRect = () => {
          const pageStep = getOriginalPageStep()
          const canvasHeight = getOriginalCanvasHeight()
          const top = ((pageNumber - 1) * pageStep) - original.scrollTop + originalCanvasOffset
          return { top, bottom: top + canvasHeight, height: canvasHeight, left: 0, right: 260, width: 260 }
        }
        originalPage.appendChild(originalCanvas)
        original.appendChild(originalPage)

        const translatedPage = document.createElement('div')
        translatedPage.className = 'pdf-translated-page pdf-page'
        translatedPage.dataset.pageNumber = String(pageNumber)
        translatedPage.getBoundingClientRect = () => {
          const top = ((pageNumber - 1) * translatedPageStep) - translated.scrollTop
          return { top, bottom: top + translatedPageStep, height: translatedPageStep, left: 0, right: 300, width: 300 }
        }
        const translatedCanvas = document.createElement('canvas')
        translatedCanvas.getBoundingClientRect = () => {
          const top = ((pageNumber - 1) * translatedPageStep) - translated.scrollTop + translatedCanvasOffset
          return { top, bottom: top + translatedCanvasHeight, height: translatedCanvasHeight, left: 0, right: 260, width: 260 }
        }
        translatedPage.appendChild(translatedCanvas)
        translated.appendChild(translatedPage)
      }

      const exposed = {
        syncFromPane: mockLayoutSyncFromPane
      }
      Object.defineProperties(exposed, {
        scrollContainer: {
          get: () => props.showOriginalPane ? original : null
        },
        translatedPaneRef: {
          get: () => props.showTranslatedPane ? translated : null
        }
      })
      expose(exposed)

      return {}
    },
    template: '<div class="pdf-viewer-layout-stub"><slot name="original" /><slot name="translated" /></div>'
  }
}))

vi.mock('./components/PdfViewer.vue', () => ({
  default: {
    name: 'PdfViewer',
    props: ['viewerRole', 'showOverlay', 'handleNavigationTarget', 'scrollContainer', 'freezeRenderWindowEviction', 'regionSelectionActive'],
    emits: ['layout-change', 'current-page-change', 'visible-pages-change', 'region-selection-complete'],
    setup(_, { expose }) {
      const pageElement = document.createElement('div')
      const stageElement = document.createElement('div')
      pageElement.getBoundingClientRect = () => ({ left: 20, top: 30, width: 180, height: 220, right: 200, bottom: 250 })
      stageElement.getBoundingClientRect = () => ({ left: 48, top: 64, width: 100, height: 100, right: 148, bottom: 164 })
      expose({
        getPageElement: vi.fn(() => pageElement),
        getPageStageElement: vi.fn(() => stageElement)
      })
      return () => h('div', { class: 'pdf-viewer-stub' })
    }
  }
}))

vi.mock('./components/PdfTranslatedPane.vue', () => ({
  default: {
    name: 'PdfTranslatedPane',
    props: ['scrollContainer'],
    template: '<div class="pdf-translated-pane-stub" />'
  }
}))

vi.mock('./components/PdfWindowsHost.vue', () => ({
  default: defineComponent({
    name: 'PdfWindowsHost',
    setup(_, { expose }) {
      expose({ openTranslation: openTranslationMock })
      return () => h('div', { class: 'pdf-windows-host-stub' })
    }
  })
}))

vi.mock('./debug/pdfOverlayDiagnostics.js', () => {
  pdfDiagnosticsImportMock()
  return {}
})

vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn()
  },
  Toaster: { name: 'Toaster', template: '<div />' }
}))

let mockPendingState
const mockGetPending = vi.fn(() => mockPendingState)
const mockClearPending = vi.fn(() => { mockPendingState = null })
const mockSetPending = vi.fn((state) => { mockPendingState = state })
vi.mock('@/features/pdf-translation/core/PendingViewerState.js', () => ({
  getPendingViewerState: () => mockGetPending(),
  setPendingViewerState: (state) => mockSetPending(state),
  clearPendingViewerState: () => mockClearPending(),
}))

const mockReadUrl = vi.fn(() => null)
const mockWriteUrl = vi.fn()
vi.mock('@/features/pdf-translation/core/PdfViewerStateUrlAdapter.js', () => ({
  readViewerStateFromUrl: () => mockReadUrl(),
  writeViewerStateToUrl: (state) => mockWriteUrl(state),
}))

import { createViewerState } from '@/features/pdf-translation/core/PdfViewerState.js'

const flushPromises = () => nextTick()
const waitAnimationFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

function createMocks({
  bannerState = null,
  hasDocument = true,
  sessionAsRef = false
} = {}) {
  const sessionMock = {
    getPageViewport: vi.fn(() => mockPdfViewport),
    getPageContentSource: vi.fn(() => pageContentSourceMock.PDF_TEXT),
    getCommittedOcrState: vi.fn(() => null),
    fileName: '',
    documentMetadata: {},
    documentIdentity: 'loaded-doc-id',
    documentGeneration: 1,
  }
  mockPdfSession = sessionMock

  mockViewerController = {
    error: ref(''),
    fileName: ref('demo.pdf'),
    hasDocument: ref(hasDocument),
    pdfSourceLanguage: ref('auto'),
    pdfTargetLanguage: ref('fa'),
    isLoading: ref(false),
    isTranslating: ref(false),
    hasTranslationContent: ref(false),
    canTranslateVisiblePages: ref(true),
    pageCount: ref(12),
    pageMetrics: ref([]),
    translationSummary: ref({
      status: 'idle',
      translatedCount: 0,
      failedCount: 0,
      totalCount: 0
    }),
    translatedPageData: ref([]),
    translationTick: ref(0),
    restoredTranslationCount: ref(0),
    pdfFingerprint: ref('fingerprint'),
    workerLabel: ref('worker'),
    currentFile: ref(null),
    session: sessionAsRef ? ref(sessionMock) : sessionMock,
    loadPdfFile: vi.fn().mockResolvedValue(true),
    recomputeLayout: vi.fn().mockResolvedValue(undefined),
    translateVisiblePages: vi.fn().mockResolvedValue(false),
    hydrateVisiblePageBlocks: vi.fn().mockResolvedValue(false),
    refreshTranslatedPageBlocks: vi.fn(),
    cancelTranslation: vi.fn(),
    clearDocumentCache: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn()
  }

  const contentView = ref('translated-pdf')
  const selectedLayoutMode = ref('single')
  const layoutMode = computed(() => (
    contentView.value === 'original' ? 'single' : selectedLayoutMode.value
  ))
  const isSideBySide = computed(() => layoutMode.value === 'side-by-side')

  mockViewerMode = {
    contentView,
    selectedLayoutMode,
    layoutMode,
    showOriginalPane: computed(() => contentView.value !== 'translation' || isSideBySide.value),
    showTranslatedTextPane: computed(() => contentView.value === 'translation'),
    showTranslatedPdfPane: computed(() => contentView.value === 'translated-pdf' && isSideBySide.value),
    showOverlayLayer: computed(() => contentView.value === 'translated-pdf' && layoutMode.value === 'single'),
    isSideBySide,
    setContentView: vi.fn((value) => {
      contentView.value = value
    }),
    setLayoutMode: vi.fn((value) => {
      selectedLayoutMode.value = value
    })
  }
  mockLayoutSyncFromPane = vi.fn()
  mockPdfViewport = {
    convertToPdfPoint: vi.fn((x, y) => [x / 2, y / 2]),
    convertToViewportPoint: vi.fn((x, y) => [x * 2, y * 2])
  }

    mockPdfExport = {
    canExport: ref(false),
    exportError: ref(''),
    exportTxt: vi.fn().mockResolvedValue(false),
    exportMarkdown: vi.fn().mockResolvedValue(false),
    exportHtml: vi.fn().mockResolvedValue(false),
  }

  const outline = ref(null)
  mockPdfNavigation = {
    currentPage: ref(5),
    isNavigating: ref(false),
    outline,
    hasOutline: computed(() => Array.isArray(outline.value) && outline.value.length > 0),
    activeOutlineDest: ref(null),
    expandedDests: ref(new Set()),
    navigateToPage: vi.fn(),
    navigateToDestination: vi.fn(),
    handleNavigationTarget: vi.fn(),
    attachDocument: vi.fn(),
    detachDocument: vi.fn(() => { outline.value = null })
  }

  mockPdfOcr = {
    ocrRecommendationCount: ref(0),
    ocrRecommendations: ref([]),
    ocrBatch: { pageNumbers: [] },
    isOcrProcessing: ref(false),
    ocrError: ref(''),
    refreshOcrRecommendations: vi.fn(),
    requestOcr: vi.fn(),
    confirmOcr: vi.fn(),
    cancelOcr: vi.fn()
  }

  mockRegionOcr = {
    outcome: ref(null),
    isProcessing: ref(false),
    startRegionOcr: vi.fn(),
    executeRegionOcr: vi.fn(),
    cancelRegionOcr: vi.fn()
  }

  if (bannerState) {
    mockViewerController.isLoading.value = Boolean(bannerState.isLoading)
    mockViewerController.error.value = bannerState.error || ''
  }
}
  describe('scroll anchor ownership transitions', () => {
    function mountInMode({ contentView, selectedLayoutMode, sessionAsRef = true }) {
      createMocks({ sessionAsRef })
      mockViewerMode.contentView.value = contentView
      mockViewerMode.selectedLayoutMode.value = selectedLayoutMode
      return mount(PdfApp)
    }
    mockPdfOcrOptions = null

    async function emitToolbar(wrapper, eventName, value) {
      wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit(eventName, value)
      await flushPromises()
    }

    it('keeps translated pane as final writer for translation single to side-by-side', async () => {
      const wrapper = mountInMode({ contentView: 'translation', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      layout.translatedPaneRef.scrollTop = 100

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')

      expect(mockViewerMode.setLayoutMode).toHaveBeenCalledWith('side-by-side')
      expect(layout.translatedPaneRef.scrollTop).toBe(100)
      expect(mockLayoutSyncFromPane).toHaveBeenLastCalledWith('translated')

      wrapper.unmount()
    })

    it('preserves translated anchor for translation side-by-side to single without secondary sync', async () => {
      const wrapper = mountInMode({ contentView: 'translation', selectedLayoutMode: 'side-by-side' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      layout.translatedPaneRef.scrollTop = 100

      await emitToolbar(wrapper, 'layout-mode-change', 'single')

      expect(mockViewerMode.setLayoutMode).toHaveBeenCalledWith('single')
      expect(layout.translatedPaneRef.scrollTop).toBe(100)
      expect(mockLayoutSyncFromPane).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('captures pdf-backed anchor for translated-pdf single to side-by-side', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      layout.scrollContainer.scrollTop = 100

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')

      expect(mockViewerMode.setLayoutMode).toHaveBeenCalledWith('side-by-side')
      expect(layout.scrollContainer.scrollTop).toBe(100)
      expect(mockLayoutSyncFromPane).toHaveBeenCalledTimes(1)
      expect(mockLayoutSyncFromPane).toHaveBeenLastCalledWith('original')

      wrapper.unmount()
    })

    it('uses pdf-backed anchors for translated-pdf layout mode toggles', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 900

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')

      expect(mockPdfViewport.convertToPdfPoint).toHaveBeenCalledWith(150, 36)
      expect(mockPdfViewport.convertToViewportPoint).not.toHaveBeenCalled()
      expect(originalPane.scrollTop).toBe(900)
      expect(mockLayoutSyncFromPane).toHaveBeenCalledTimes(1)
      expect(mockLayoutSyncFromPane).toHaveBeenLastCalledWith('original')

      wrapper.unmount()
    })

    it('defers pdf-backed scroll restore on repeated translated-pdf layout toggles', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 900

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')
      expect(originalPane.scrollTop).toBe(900)
      expect(mockLayoutSyncFromPane).toHaveBeenCalledTimes(1)
      expect(mockLayoutSyncFromPane).toHaveBeenLastCalledWith('original')

      await emitToolbar(wrapper, 'layout-mode-change', 'single')
      expect(originalPane.scrollTop).toBe(900)

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')
      expect(originalPane.scrollTop).toBe(900)
      expect(mockLayoutSyncFromPane).toHaveBeenCalledTimes(2)
      expect(mockLayoutSyncFromPane).toHaveBeenLastCalledWith('original')

      expect(mockPdfViewport.convertToPdfPoint).toHaveBeenCalledTimes(3)
      expect(mockPdfViewport.convertToViewportPoint).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('uses pdf-backed anchors when translated-pdf layout recomputes page metrics', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 900

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')
      await waitAnimationFrame()
      await flushPromises()

      const translatedPane = layout.translatedPaneRef
      translatedPane.scrollTop = 320

      mockPdfViewport.convertToPdfPoint.mockClear()
      mockPdfViewport.convertToViewportPoint.mockClear()
      mockViewerController.recomputeLayout.mockClear()
      originalPane.scrollTop = 760

      wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('layout-change', { width: 800, height: 600 })
      await flushPromises()

      expect(mockViewerController.recomputeLayout).toHaveBeenCalled()
      expect(mockPdfViewport.convertToPdfPoint).not.toHaveBeenCalled()
      expect(mockLayoutSyncFromPane).toHaveBeenCalledTimes(1)
      expect(mockLayoutSyncFromPane).toHaveBeenLastCalledWith('original')
      expect(originalPane.scrollTop).toBe(760)
      expect(translatedPane.scrollTop).toBe(320)

      wrapper.unmount()
    })

    it('suppresses layout-change restore during fit-page zoom transitions', async () => {
      const wrapper = mountInMode({ contentView: 'original', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 900
      originalPane.scrollTo.mockClear()

      let emittedLayoutChange = false
      mockViewerController.recomputeLayout.mockImplementation(async () => {
        if (emittedLayoutChange) return
        emittedLayoutChange = true
        wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('layout-change', { width: 800, height: 600 })
      })

      await emitToolbar(wrapper, 'zoom-change', { mode: 'fit-page', value: 100 })
      await flushPromises()
      await flushPromises()
      await flushPromises()

      expect(mockViewerController.recomputeLayout).toHaveBeenCalledTimes(2)
      expect(mockViewerController.recomputeLayout).toHaveBeenNthCalledWith(2, {
        width: 800,
        height: 600,
        availableCanvasWidth: 752,
        availableCanvasHeight: 500,
        zoomMode: 'fit-page',
        zoomPercent: 100
      })
      expect(originalPane.scrollTo).toHaveBeenCalledTimes(1)
      expect(originalPane.scrollTo.mock.invocationCallOrder[0]).toBeGreaterThan(
        mockViewerController.recomputeLayout.mock.invocationCallOrder[1]
      )

      wrapper.unmount()
    })

    it('snaps original single fit-page zoom to the current page top', async () => {
      const wrapper = mountInMode({ contentView: 'original', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 900

      await emitToolbar(wrapper, 'zoom-change', { mode: 'fit-page', value: 100 })
      await flushPromises()

      expect(originalPane.scrollTop).toBe(840)

      wrapper.unmount()
    })

    it('snaps translated-pdf single fit-page zoom to the current page top', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 900

      await emitToolbar(wrapper, 'zoom-change', { mode: 'fit-page', value: 100 })
      await flushPromises()

      expect(originalPane.scrollTop).toBe(840)

      wrapper.unmount()
    })

    it('derives translated zoom anchor from original when translated pane is stale', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', selectedLayoutMode: 'side-by-side' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      const translatedPane = layout.translatedPaneRef
      originalPane.scrollTop = 900
      translatedPane.scrollTop = 0

      await emitToolbar(wrapper, 'zoom-change', { mode: 'fit-page', value: 100 })
      await flushPromises()

      expect(translatedPane.scrollTop).toBe(900)

      wrapper.unmount()
    })

    it('uses a DOM page anchor when leaving fit-page near the top of a page', async () => {
      const wrapper = mountInMode({ contentView: 'original', selectedLayoutMode: 'side-by-side' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer

      await emitToolbar(wrapper, 'zoom-change', { mode: 'fit-page', value: 100 })
      await flushPromises()

      mockPdfViewport.convertToPdfPoint.mockClear()
      mockPdfViewport.convertToViewportPoint.mockClear()

      const pageEl = originalPane.querySelector('.pdf-page[data-page-number="12"]')
      const canvasEl = pageEl?.querySelector('canvas')
      if (pageEl) {
        pageEl.getBoundingClientRect = () => ({
          top: 0,
          bottom: 100,
          height: 100,
          left: 0,
          right: 300,
          width: 300
        })
      }
      if (canvasEl) {
        canvasEl.getBoundingClientRect = () => ({
          top: 24,
          bottom: 64,
          height: 40,
          left: 0,
          right: 260,
          width: 260
        })
      }

      await emitToolbar(wrapper, 'zoom-change', { mode: 'fit-width', value: 100 })
      await flushPromises()

      expect(mockPdfViewport.convertToPdfPoint).toHaveBeenCalled()
      expect(mockPdfViewport.convertToViewportPoint).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('preserves page when switching original to translation', async () => {
      const wrapper = mountInMode({ contentView: 'original', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      layout.scrollContainer.scrollTop = 100

      await emitToolbar(wrapper, 'content-view-change', 'translation')

      expect(mockViewerMode.setContentView).toHaveBeenCalledWith('translation')
      expect(layout.translatedPaneRef.scrollTop).toBe(100)
      expect(mockLayoutSyncFromPane).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('does not drift on repeated translation layout toggles', async () => {
      const wrapper = mountInMode({ contentView: 'translation', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      layout.translatedPaneRef.scrollTop = 100

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')
      await emitToolbar(wrapper, 'layout-mode-change', 'single')
      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')

      expect(layout.translatedPaneRef.scrollTop).toBe(100)
      expect(mockLayoutSyncFromPane).toHaveBeenCalledTimes(2)
      expect(mockLayoutSyncFromPane).toHaveBeenNthCalledWith(1, 'translated')
      expect(mockLayoutSyncFromPane).toHaveBeenNthCalledWith(2, 'translated')

      wrapper.unmount()
    })

    it('uses logical current page when translated DOM capture is stale during translation to original', async () => {
      const wrapper = mountInMode({ contentView: 'original', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 600
      wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('current-page-change', 7)
      await flushPromises()

      await emitToolbar(wrapper, 'content-view-change', 'translation')
      layout.translatedPaneRef.scrollTop = 0
      originalPane.scrollTo.mockClear()

      await emitToolbar(wrapper, 'content-view-change', 'original')
      wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('layout-change', { width: 800, height: 600 })
      await flushPromises()

      expect(originalPane.scrollTop).toBe(720)
      expect(originalPane.scrollTo).toHaveBeenCalledTimes(1)

      wrapper.unmount()
    })

    it('does not hydrate translated-pdf blocks from current-page-change', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', selectedLayoutMode: 'single' })
      await flushPromises()

      wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('current-page-change', 7)
      await flushPromises()

      expect(mockViewerController.hydrateVisiblePageBlocks).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('hydrates translated-pdf blocks from visible-pages-change', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', selectedLayoutMode: 'single' })
      await flushPromises()

      wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('visible-pages-change', new Set([2, 3]))
      await flushPromises()

      expect(mockViewerController.hydrateVisiblePageBlocks).toHaveBeenCalledTimes(1)
      expect([...mockViewerController.hydrateVisiblePageBlocks.mock.calls[0][0]]).toEqual([2, 3])

      wrapper.unmount()
    })

    it('ignores empty visible-pages-change events', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', selectedLayoutMode: 'single' })
      await flushPromises()

      wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('visible-pages-change', new Set())
      await flushPromises()

      expect(mockViewerController.hydrateVisiblePageBlocks).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('ignores visible-pages-change outside translated-pdf mode', async () => {
      const wrapper = mountInMode({ contentView: 'original', selectedLayoutMode: 'single' })
      await flushPromises()

      wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('visible-pages-change', new Set([2]))
      await flushPromises()

      expect(mockViewerController.hydrateVisiblePageBlocks).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('uses logical current page when translated DOM capture is stale during translation to translated-pdf', async () => {
      const wrapper = mountInMode({ contentView: 'original', selectedLayoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 600
      wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('current-page-change', 7)
      await flushPromises()

      await emitToolbar(wrapper, 'content-view-change', 'translation')
      layout.translatedPaneRef.scrollTop = 0
      originalPane.scrollTo.mockClear()

      await emitToolbar(wrapper, 'content-view-change', 'translated-pdf')
      wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('layout-change', { width: 800, height: 600 })
      await flushPromises()

      expect(originalPane.scrollTop).toBe(720)
      expect(originalPane.scrollTo).toHaveBeenCalledTimes(1)

      wrapper.unmount()
    })

    it('preserves pdf-backed scroll position across original and translated-pdf toggles', async () => {
      const wrapper = mountInMode({ contentView: 'original', selectedLayoutMode: 'side-by-side' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 900

      await emitToolbar(wrapper, 'content-view-change', 'translated-pdf')

      expect(mockViewerMode.setContentView).toHaveBeenCalledWith('translated-pdf')
      expect(mockPdfViewport.convertToPdfPoint).toHaveBeenCalledWith(150, 36)
      expect(mockPdfViewport.convertToViewportPoint).toHaveBeenCalledWith(75, 18)
      expect(originalPane.scrollTop).toBe(760)

      await emitToolbar(wrapper, 'content-view-change', 'original')

      expect(mockViewerMode.setContentView).toHaveBeenCalledWith('original')
      expect(originalPane.scrollTop).toBe(920)
      expect(mockPdfViewport.convertToPdfPoint).toHaveBeenCalledTimes(2)
      expect(mockPdfViewport.convertToViewportPoint).toHaveBeenCalledTimes(2)

      wrapper.unmount()
    })

    it('uses getPageViewport from a runtime-shaped plain session object', async () => {
      const wrapper = mountInMode({
        contentView: 'original',
        selectedLayoutMode: 'side-by-side',
        sessionAsRef: false
      })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      layout.scrollContainer.scrollTop = 900

      await emitToolbar(wrapper, 'content-view-change', 'translated-pdf')

      expect(mockViewerController.session.getPageViewport).toHaveBeenCalledWith(8)
      expect(mockPdfViewport.convertToPdfPoint).toHaveBeenCalledWith(150, 36)
      expect(mockPdfViewport.convertToViewportPoint).toHaveBeenCalledWith(75, 18)

      wrapper.unmount()
    })

    it('preserves the top-of-page pdf-backed position', async () => {
      const wrapper = mountInMode({ contentView: 'original', selectedLayoutMode: 'side-by-side' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 864

      await emitToolbar(wrapper, 'content-view-change', 'translated-pdf')

      expect(mockPdfViewport.convertToPdfPoint).toHaveBeenCalledWith(150, 0)
      expect(mockPdfViewport.convertToViewportPoint).toHaveBeenCalledWith(75, 0)
      expect(originalPane.scrollTop).toBe(724)

      wrapper.unmount()
    })

    it('falls back when the canvas is missing', async () => {
      const wrapper = mountInMode({ contentView: 'original', selectedLayoutMode: 'side-by-side' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      const pageEightCanvas = originalPane.querySelector('.pdf-page[data-page-number="8"] canvas')
      pageEightCanvas?.remove()
      originalPane.scrollTop = 900

      await emitToolbar(wrapper, 'content-view-change', 'translated-pdf')

      expect(mockPdfViewport.convertToPdfPoint).not.toHaveBeenCalled()
      expect(originalPane.scrollTop).toBe(700)

      wrapper.unmount()
    })
  })

