import { computed, defineComponent, h, nextTick, reactive, ref } from 'vue'
import { vi } from 'vitest'

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

vi.mock('@/features/pdf-translation/core/PendingViewerState.js', () => ({
  getPendingViewerState: () => mockGetPending(),
  setPendingViewerState: (state) => mockSetPending(state),
  clearPendingViewerState: () => mockClearPending(),
}))

vi.mock('@/features/pdf-translation/core/PdfViewerStateUrlAdapter.js', () => ({
  readViewerStateFromUrl: () => mockReadUrl(),
  writeViewerStateToUrl: (state) => mockWriteUrl(state),
}))

let mockPendingState
const mockGetPending = vi.fn(() => mockPendingState)
const mockClearPending = vi.fn(() => { mockPendingState = null })
const mockSetPending = vi.fn((state) => { mockPendingState = state })
const mockReadUrl = vi.fn(() => null)
const mockWriteUrl = vi.fn()

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

export {
  mockViewerController,
  mockViewerMode,
  mockPdfExport,
  mockPdfNavigation,
  mockPdfOcr,
  mockPdfOcrOptions,
  mockRegionOcr,
  mockRegionOcrOptions,
  mockLayoutSyncFromPane,
  mockPdfViewport,
  mockPdfSession,
  mockRegionExecutionDispatch,
  openTranslationMock,
  downloadFileMock,
  openOptionsPageMock,
  pdfDiagnosticsImportMock,
  pdfAppLoggerMock,
  browserTabStateMock,
  settingsStoreMock,
  ocrStoreMock,
  regionComparisonRunnerMock,
  activityCompletedMock,
  translationPartialMock,
  translationFailedMock,
  pageContentSourceMock,
  createMockOperation,
  createDeferred,
  mockPendingState,
  mockGetPending,
  mockClearPending,
  mockSetPending,
  mockReadUrl,
  mockWriteUrl,
  flushPromises,
  waitAnimationFrame,
  createMocks,
}
