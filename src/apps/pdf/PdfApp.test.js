import { afterEach, describe, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import PdfApp from './PdfApp.vue'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'
import { PdfDeveloperApi } from './PdfDeveloperApi.js'

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

function createMockOperation(promise, cancel = vi.fn()) {
  return Object.freeze({
    promise,
    cancel,
    context: Object.freeze({ target: 'ocr' })
  })
}

function createDeferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

vi.mock('./composables/usePdfViewerController.js', () => ({
  usePdfViewerController: () => mockViewerController
}))

vi.mock('./composables/usePdfViewerMode.js', () => ({
  usePdfViewerMode: () => mockViewerMode,
  CONTENT_VIEW: { ORIGINAL: 'original', TRANSLATION: 'translation', TRANSLATED_PDF: 'translated-pdf' },
  LAYOUT_MODE: { SINGLE: 'single', SIDE_BY_SIDE: 'side-by-side' },
  VIEWER_ROLE: { ORIGINAL: 'original', OVERLAY: 'overlay' }
}))

vi.mock('./composables/usePdfExport.js', () => ({
  usePdfExport: () => mockPdfExport
}))

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
  useSettingsStore: () => ({
    isDarkTheme: false,
    settings: {
      THEME: 'auto'
    }
  })
}))

vi.mock('@/utils/ui/theme.js', () => ({
  applyTheme: vi.fn()
}))

vi.mock('@/features/pdf-translation/core/PdfFileDownloader.js', () => ({
  downloadFile: downloadFileMock
}))

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: { DEBUG_MODE: false },
  getSourceLanguageAsync: vi.fn().mockResolvedValue('auto')
}))

vi.mock('./components/PdfToolbar.vue', () => ({
  default: {
    name: 'PdfToolbar',
    props: ['fileName', 'pageCount', 'currentPageNumber', 'zoomMode', 'zoomPercent', 'contentView', 'layoutMode', 'ocrRecommendationCount', 'executionMode', 'executionModes', 'regionOcrState', 'regionOcrAvailable', 'benchmarkState', 'canExportBenchmarkArtifact'],
    emits: ['toggle-outline', 'translate-visible', 'cancel-translation', 'content-view-change', 'layout-mode-change', 'zoom-step', 'zoom-change', 'export-txt', 'export-markdown', 'export-html', 'request-ocr', 'request-region-ocr', 'request-region-benchmark', 'cancel-region-benchmark', 'export-benchmark-artifact', 'clear-cache', 'request-open-pdf', 'execution-mode-change'],
    template: '<header class="pdf-toolbar-stub" />'
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

vi.mock('./components/PdfOcrConsentPrompt.vue', () => ({
  default: {
    name: 'PdfOcrConsentPrompt',
    template: '<div class="pdf-ocr-consent-stub" />'
  }
}))

vi.mock('./components/PdfOcrProgress.vue', () => ({
  default: {
    name: 'PdfOcrProgress',
    template: '<div class="pdf-ocr-progress-stub" />'
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

vi.mock('./debug/pdfOverlayDiagnostics.js', () => ({}))

const flushPromises = () => nextTick()
const waitAnimationFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

function createMocks({
  bannerState = null,
  hasDocument = true,
  sessionAsRef = true
} = {}) {
  const sessionMock = {
    getPageViewport: vi.fn(() => mockPdfViewport)
  }
  mockPdfSession = sessionMock

  mockViewerController = {
    error: ref(''),
    fileName: ref('demo.pdf'),
    hasDocument: ref(hasDocument),
    isLoading: ref(false),
    isTranslating: ref(false),
    hasAnyTranslation: ref(false),
    canTranslateVisiblePages: ref(true),
    pageCount: ref(12),
    pageMetrics: ref([]),
    pageScale: ref(1),
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
    session: sessionAsRef ? ref(sessionMock) : sessionMock,
    loadPdfFile: vi.fn().mockResolvedValue(true),
    recomputeLayout: vi.fn().mockResolvedValue(undefined),
    translateVisiblePages: vi.fn(),
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
    clearExportError: vi.fn()
  }

  mockPdfOcr = {
    ocrRecommendationCount: ref(0),
    ocrBatch: { pageNumbers: [] },
    isOcrPromptVisible: ref(false),
    isOcrProcessing: ref(false),
    ocrProgress: ref(0),
    ocrError: ref(''),
    refreshOcrRecommendations: vi.fn(),
    requestOcr: vi.fn(),
    confirmOcr: vi.fn(),
    cancelOcr: vi.fn(),
    dismissOcrPrompt: vi.fn()
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
    mockViewerController.isTranslating.value = Boolean(bannerState.isTranslating)
    mockViewerController.restoredTranslationCount.value = bannerState.restoredTranslationCount ?? 0
    mockViewerController.error.value = bannerState.error || ''
    mockPdfExport.exportError.value = bannerState.exportError || ''
    mockPdfOcr.ocrError.value = bannerState.ocrError || ''
  }
}

describe('PdfApp', () => {
  beforeEach(() => {
    vi.useRealTimers()
    openTranslationMock.mockReset()
    mockRegionExecutionDispatch.mockClear()
    createMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllTimers()
  })

  it('renders the status banner outside the viewer content flow when active', async () => {
    createMocks({
      bannerState: {
        isTranslating: true
      }
    })

    const wrapper = mount(PdfApp)
    await flushPromises()
    await flushPromises()

    const banner = wrapper.find('.pdf-status-banner')
    const content = wrapper.find('.pdf-app__content')
    const viewerLayout = wrapper.find('.pdf-viewer-layout-stub')

    expect(banner.exists()).toBe(true)
    expect(wrapper.find('.pdf-app__status-row').exists()).toBe(true)
    expect(viewerLayout.exists()).toBe(true)
    expect(content.exists()).toBe(true)
    expect(content.element.contains(banner.element)).toBe(false)
    expect(banner.element.parentElement?.closest('.pdf-app__content')).toBeNull()
  })

  it('hides the status banner cleanly when idle', async () => {
    createMocks({
      bannerState: null
    })

    const wrapper = mount(PdfApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.pdf-status-banner').exists()).toBe(false)
    expect(wrapper.find('.pdf-app__status-row').exists()).toBe(false)
    expect(wrapper.find('.pdf-viewer-layout-stub').exists()).toBe(true)
  })

  it('refreshes OCR page wrappers before incrementing translationTick on OCR completion', async () => {
    createMocks()
    const order = []
    mockViewerController.refreshTranslatedPageBlocks.mockImplementation(() => {
      order.push(`refresh:${mockViewerController.translationTick.value}`)
      return true
    })

    mount(PdfApp)
    await flushPromises()

    mockPdfOcrOptions.onOcrComplete({ pageNumbers: [2, 1] })

    expect(mockViewerController.refreshTranslatedPageBlocks).toHaveBeenCalledWith([2, 1])
    expect(mockViewerController.translationTick.value).toBe(1)
    expect(order).toEqual(['refresh:0'])
    expect(mockPdfOcr.refreshOcrRecommendations).toHaveBeenCalled()
    expect(mockViewerController.recomputeLayout).not.toHaveBeenCalled()
  })

  it('builds OCR RegionExecutionRequest and preserves recognized-text handoff', async () => {
    createMocks({ sessionAsRef: false })

    mockRegionOcr.startRegionOcr.mockImplementation(() => {
      mockRegionOcrOptions.onRecognized?.({ text: ' recognized text ', lines: [], confidence: 99 })
      return createMockOperation(Promise.resolve({ status: 'recognized', data: { text: 'recognized text', lines: [], confidence: 99 } }))
    })

    const wrapper = mount(PdfApp)
    await flushPromises()

    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('region-selection-complete', region)
    await flushPromises()
    await flushPromises()

    expect(mockRegionExecutionDispatch).toHaveBeenCalledOnce()
    expect(mockRegionExecutionDispatch.mock.calls[0][0]).toEqual({
      region,
      target: 'ocr',
      scope: 'live-region'
    })
    expect(mockRegionOcr.startRegionOcr).toHaveBeenCalledOnce()

    await vi.waitFor(() => {
      expect(openTranslationMock).toHaveBeenCalledWith({
        text: 'recognized text',
        position: {
          x: 50,
          y: 68,
          width: 4,
          height: 4,
          _isViewportRelative: true
        }
      })
    })
  })

  it('arms one region selection from the toolbar and dispatches through PdfApp ownership', async () => {
    mockRegionOcr.startRegionOcr.mockReturnValue(createMockOperation(Promise.resolve({ status: 'cancelled' })))
    const wrapper = mount(PdfApp)
    await flushPromises()

    const toolbar = wrapper.findComponent({ name: 'PdfToolbar' })
    const viewer = wrapper.findComponent({ name: 'PdfViewer' })
    toolbar.vm.$emit('request-region-ocr')
    await flushPromises()

    expect(viewer.props('regionSelectionActive')).toBe(true)

    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    viewer.vm.$emit('region-selection-complete', region)
    await flushPromises()

    expect(viewer.props('regionSelectionActive')).toBe(false)
    expect(mockRegionExecutionDispatch).toHaveBeenCalledOnce()
    expect(mockRegionExecutionDispatch.mock.calls[0][0]).toEqual(expect.objectContaining({ region, target: 'ocr' }))
    expect(mockRegionOcr.startRegionOcr).toHaveBeenCalledOnce()
  })

  it('completes a benchmark and exports its artifact through PdfApp ownership', async () => {
    downloadFileMock.mockReset()
    const candidates = Object.freeze([Object.freeze({
      candidateId: 'scale-1-eng',
      configuration: Object.freeze({ scale: 1, language: 'eng' })
    })])
    const results = Object.freeze([Object.freeze({
      candidateId: 'scale-1-eng',
      configuration: candidates[0].configuration,
      runtime: Object.freeze({ latencyMs: 40 }),
      output: Object.freeze({ status: 'recognized' })
    })])
    const runRegionBenchmark = vi.spyOn(PdfDeveloperApi.prototype, 'runRegionBenchmark')
      .mockReturnValue(createMockOperation(Promise.resolve({
        status: 'ready',
        candidates,
        results,
        summary: Object.freeze({ totalCandidates: 1, completedCandidates: 1, totalElapsedMs: 40 })
      })))
    const wrapper = mount(PdfApp)
    await flushPromises()

    const toolbar = wrapper.findComponent({ name: 'PdfToolbar' })
    const viewer = wrapper.findComponent({ name: 'PdfViewer' })
    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    toolbar.vm.$emit('request-region-benchmark')
    await flushPromises()

    expect(viewer.props('regionSelectionActive')).toBe(true)

    viewer.vm.$emit('region-selection-complete', region)
    await flushPromises()

    expect(viewer.props('regionSelectionActive')).toBe(false)
    expect(runRegionBenchmark).toHaveBeenCalledWith({ region })
    expect(mockRegionOcr.startRegionOcr).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(toolbar.props('benchmarkState')).toMatchObject({
      status: 'completed',
      progress: { totalCandidates: 1, completedCandidates: 1 }
    }))
    expect(toolbar.props('canExportBenchmarkArtifact')).toBe(true)
    toolbar.vm.$emit('export-benchmark-artifact')
    expect(downloadFileMock).toHaveBeenCalledWith(
      expect.stringContaining('"artifactType": "region-benchmark"'),
      'region-benchmark-artifact.json',
      'application/json'
    )
    runRegionBenchmark.mockRestore()
  })

  it('preserves completed benchmark results after cancellation', async () => {
    const deferred = createDeferred()
    const cancel = vi.fn()
    const runRegionBenchmark = vi.spyOn(PdfDeveloperApi.prototype, 'runRegionBenchmark')
      .mockReturnValue(createMockOperation(deferred.promise, cancel))
    const wrapper = mount(PdfApp)
    await flushPromises()
    const toolbar = wrapper.findComponent({ name: 'PdfToolbar' })
    const viewer = wrapper.findComponent({ name: 'PdfViewer' })
    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })

    toolbar.vm.$emit('request-region-benchmark')
    await flushPromises()
    viewer.vm.$emit('region-selection-complete', region)
    await flushPromises()
    expect(toolbar.props('benchmarkState')).toMatchObject({ status: 'running' })

    toolbar.vm.$emit('cancel-region-benchmark')
    expect(cancel).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(toolbar.props('benchmarkState')).toMatchObject({ status: 'cancelling' }))

    deferred.resolve({
      status: 'cancelled',
      results: Object.freeze([Object.freeze({ candidateId: 'scale-1-eng' })]),
      summary: Object.freeze({ totalCandidates: 2, completedCandidates: 1, totalElapsedMs: 40 })
    })
    await flushPromises()

    await vi.waitFor(() => expect(toolbar.props('benchmarkState')).toMatchObject({
      status: 'cancelled',
      progress: { totalCandidates: 2, completedCandidates: 1 },
      results: [{ candidateId: 'scale-1-eng' }]
    }))
    runRegionBenchmark.mockRestore()
  })

  it('toggles selection off with toolbar cancel and Escape', async () => {
    const wrapper = mount(PdfApp)
    await flushPromises()
    const toolbar = wrapper.findComponent({ name: 'PdfToolbar' })
    const viewer = wrapper.findComponent({ name: 'PdfViewer' })

    toolbar.vm.$emit('request-region-ocr')
    await flushPromises()
    expect(viewer.props('regionSelectionActive')).toBe(true)

    toolbar.vm.$emit('request-region-ocr')
    await flushPromises()
    expect(viewer.props('regionSelectionActive')).toBe(false)

    toolbar.vm.$emit('request-region-ocr')
    await flushPromises()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(viewer.props('regionSelectionActive')).toBe(false)
  })

  it('returns selection to idle on document replacement', async () => {
    const wrapper = mount(PdfApp)
    await flushPromises()
    wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit('request-region-ocr')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'PdfViewer' }).props('regionSelectionActive')).toBe(true)

    wrapper.findComponent({ name: 'PdfDropzone' }).vm.$emit('file-selected', { name: 'replacement.pdf' })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'PdfViewer' }).props('regionSelectionActive')).toBe(false)
  })

  it('shows processing then returns idle with outcome notifications', async () => {
    let resolveOcr
    mockRegionOcr.startRegionOcr.mockReturnValue(createMockOperation(new Promise((resolve) => {
      resolveOcr = resolve
    })))
    const wrapper = mount(PdfApp)
    await flushPromises()
    const toolbar = wrapper.findComponent({ name: 'PdfToolbar' })
    const viewer = wrapper.findComponent({ name: 'PdfViewer' })

    toolbar.vm.$emit('request-region-ocr')
    viewer.vm.$emit('region-selection-complete', createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }))
    await flushPromises()
    expect(toolbar.props('regionOcrState')).toBe('processing')
    expect(toolbar.props('regionOcrAvailable')).toBe(true)

    resolveOcr({ status: 'recognized', data: { text: '' } })
    await flushPromises()
    await flushPromises()
    expect(toolbar.props('regionOcrState')).toBe('idle')
    expect(wrapper.text()).toContain('No text found in the selected region.')
  })

  it('returns to idle and notifies on Region OCR failure', async () => {
    mockRegionOcr.startRegionOcr.mockReturnValue(createMockOperation(Promise.resolve({ status: 'failed', error: new Error('failed') })))
    const wrapper = mount(PdfApp)
    await flushPromises()
    const toolbar = wrapper.findComponent({ name: 'PdfToolbar' })
    toolbar.vm.$emit('request-region-ocr')
    wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('region-selection-complete', createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }))
    await flushPromises()
    await flushPromises()

    expect(toolbar.props('regionOcrState')).toBe('idle')
    expect(wrapper.text()).toContain('OCR failed. Please try another region.')
  })

  it('owns the OCR-only execution mode and rejects unsupported toolbar intent', async () => {
    const wrapper = mount(PdfApp)
    await flushPromises()

    const toolbar = wrapper.findComponent({ name: 'PdfToolbar' })
    expect(toolbar.props('executionMode')).toBe('ocr')
    expect(toolbar.props('executionModes')).toEqual(['ocr'])

    toolbar.vm.$emit('execution-mode-change', 'benchmark')
    await flushPromises()

    expect(toolbar.props('executionMode')).toBe('ocr')
    expect(mockPdfSession).not.toHaveProperty('executionMode')
  })

  it('keeps dispatched request target immutable after later mode intent', async () => {
    let resolveOcr
    mockRegionOcr.startRegionOcr.mockImplementation(() => createMockOperation(new Promise((resolve) => {
      resolveOcr = resolve
    })))

    const wrapper = mount(PdfApp)
    await flushPromises()

    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('region-selection-complete', region)
    await flushPromises()

    const request = mockRegionExecutionDispatch.mock.calls[0][0]
    wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit('execution-mode-change', 'benchmark')
    await flushPromises()

    expect(mockRegionExecutionDispatch).toHaveBeenCalledOnce()
    expect(request).toEqual({ region, target: 'ocr', scope: 'live-region' })
    expect(Object.isFrozen(request)).toBe(true)

    resolveOcr({ status: 'cancelled' })
    await flushPromises()
  })

  it('cancels active Region OCR before loading a replacement PDF', async () => {
    const order = []
    const operationCancel = vi.fn(() => order.push('operation-cancel'))
    let resolveOcr
    mockRegionOcr.startRegionOcr.mockImplementation(() => createMockOperation(new Promise((resolve) => {
      resolveOcr = resolve
    }), operationCancel))
    mockRegionOcr.cancelRegionOcr.mockImplementation(() => {
      order.push('cancel-region-ocr')
      operationCancel()
    })
    mockViewerController.loadPdfFile.mockImplementation(() => {
      order.push('load-pdf')
      return Promise.resolve(true)
    })

    const wrapper = mount(PdfApp)
    await flushPromises()

    wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('region-selection-complete', createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }))
    await flushPromises()
    wrapper.findComponent({ name: 'PdfDropzone' }).vm.$emit('file-selected', { name: 'replacement.pdf' })
    await flushPromises()

    expect(mockRegionOcr.cancelRegionOcr).toHaveBeenCalledOnce()
    expect(operationCancel).toHaveBeenCalledOnce()
    expect(order).toEqual(['cancel-region-ocr', 'operation-cancel', 'load-pdf'])

    resolveOcr({ status: 'cancelled' })
  })

  it('suppresses late recognized handoff after PDF replacement', async () => {
    mockRegionOcr.startRegionOcr.mockReturnValue(createMockOperation(new Promise(() => {})))

    const wrapper = mount(PdfApp)
    await flushPromises()

    wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('region-selection-complete', createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }))
    await flushPromises()
    wrapper.findComponent({ name: 'PdfDropzone' }).vm.$emit('file-selected', { name: 'replacement.pdf' })
    await flushPromises()
    mockRegionOcrOptions.onRecognized({ text: 'late text', lines: [], confidence: 99 })
    await flushPromises()

    expect(mockRegionOcr.cancelRegionOcr).toHaveBeenCalledOnce()
    expect(openTranslationMock).not.toHaveBeenCalled()
  })

  it('keeps completed Region OCR behavior through document replacement', async () => {
    createMocks({ sessionAsRef: false })
    mockRegionOcr.startRegionOcr.mockImplementation(() => {
      mockRegionOcrOptions.onRecognized({ text: 'recognized text', lines: [], confidence: 99 })
      return createMockOperation(Promise.resolve({ status: 'recognized', data: { text: 'recognized text', lines: [], confidence: 99 } }))
    })

    const wrapper = mount(PdfApp)
    await flushPromises()

    wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('region-selection-complete', createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }))
    await flushPromises()
    wrapper.findComponent({ name: 'PdfDropzone' }).vm.$emit('file-selected', { name: 'replacement.pdf' })
    await flushPromises()

    await vi.waitFor(() => {
      expect(openTranslationMock).toHaveBeenCalledOnce()
    })
    expect(mockRegionOcr.cancelRegionOcr).toHaveBeenCalledOnce()
    expect(mockViewerController.loadPdfFile).toHaveBeenCalledWith({ name: 'replacement.pdf' }, expect.any(Object))
  })

  it('keeps execution mode through document replacement and cancels no active Region OCR', async () => {
    const firstWrapper = mount(PdfApp)
    await flushPromises()

    firstWrapper.findComponent({ name: 'PdfDropzone' }).vm.$emit('file-selected', { name: 'replacement.pdf' })
    await flushPromises()

    expect(firstWrapper.findComponent({ name: 'PdfToolbar' }).props('executionMode')).toBe('ocr')
    expect(mockRegionOcr.cancelRegionOcr).toHaveBeenCalledOnce()
    expect(mockViewerController.loadPdfFile).toHaveBeenCalledWith({ name: 'replacement.pdf' }, expect.any(Object))
    firstWrapper.unmount()

    const secondWrapper = mount(PdfApp)
    await flushPromises()

    expect(secondWrapper.findComponent({ name: 'PdfToolbar' }).props('executionMode')).toBe('ocr')
  })

  it('does not open translation for failed OCR result', async () => {
    mockRegionOcr.startRegionOcr.mockReturnValue(createMockOperation(Promise.resolve({ status: 'failed', error: new Error('failed') })))

    const wrapper = mount(PdfApp)
    await flushPromises()

    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('region-selection-complete', region)
    await flushPromises()
    await flushPromises()

    expect(mockRegionExecutionDispatch).toHaveBeenCalledOnce()
    expect(openTranslationMock).not.toHaveBeenCalled()
  })

  it('does not open translation for cancelled OCR result', async () => {
    mockRegionOcr.startRegionOcr.mockReturnValue(createMockOperation(Promise.resolve({ status: 'cancelled' })))

    const wrapper = mount(PdfApp)
    await flushPromises()

    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('region-selection-complete', region)
    await flushPromises()
    await flushPromises()

    expect(mockRegionExecutionDispatch).toHaveBeenCalledOnce()
    expect(openTranslationMock).not.toHaveBeenCalled()
  })

  it('shows a transient TXT export success banner', async () => {
    vi.useFakeTimers()
    createMocks()
    mockPdfExport.exportTxt.mockResolvedValue(true)

    const wrapper = mount(PdfApp)
    await flushPromises()

    wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit('export-txt')
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('TXT export ready')
    expect(wrapper.text()).toContain('TXT export downloaded successfully.')

    vi.advanceTimersByTime(2200)
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.pdf-status-banner').exists()).toBe(false)
  })

  it('shows a Markdown export success banner', async () => {
    createMocks()
    mockPdfExport.exportMarkdown.mockResolvedValue(true)

    const wrapper = mount(PdfApp)
    await flushPromises()

    wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit('export-markdown')
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('Markdown export ready')
    expect(wrapper.text()).toContain('Markdown export downloaded successfully.')
  })

  it('clicks hidden file input when open pdf is requested', async () => {
    createMocks()

    const wrapper = mount(PdfApp)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    let currentValue = 'stale.pdf'
    Object.defineProperty(fileInput.element, 'value', {
      configurable: true,
      get: () => currentValue,
      set: (next) => {
        currentValue = next
      }
    })
    const clickSpy = vi.spyOn(fileInput.element, 'click').mockImplementation(() => {
      expect(currentValue).toBe('')
    })

    wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit('request-open-pdf')
    await flushPromises()

    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })

  it('loads selected pdf and resets hidden input value', async () => {
    createMocks()

    const wrapper = mount(PdfApp)
    await flushPromises()

    const fileInput = wrapper.find('input[type="file"]')
    const file = new File(['pdf'], 'sample.pdf', { type: 'application/pdf' })

    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [file]
    })

    fileInput.element.dispatchEvent(new Event('change'))
    await flushPromises()
    await flushPromises()

    expect(mockViewerController.loadPdfFile).toHaveBeenCalledWith(file, expect.any(Object))
    expect(fileInput.element.value).toBe('')
  })

  it('shows an HTML export success banner', async () => {
    createMocks()
    mockPdfExport.exportHtml.mockResolvedValue(true)

    const wrapper = mount(PdfApp)
    await flushPromises()

    wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit('export-html')
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('HTML export ready')
    expect(wrapper.text()).toContain('HTML export downloaded successfully.')
  })

  it.each([
    ['PDF load', { error: 'Failed to open the PDF file.' }],
    ['export', { exportError: 'Failed to export as TXT.' }],
    ['OCR', { ocrError: 'OCR failed.' }]
  ])('shows only the banner for %s errors', async (_label, bannerState) => {
    createMocks({ bannerState })

    const wrapper = mount(PdfApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.pdf-status-banner').exists()).toBe(true)
    expect(wrapper.find('.pdf-app__error').exists()).toBe(false)
    expect(wrapper.text()).toContain(bannerState.error || bannerState.exportError || bannerState.ocrError)
  })

  it('dismisses persistent error banner without mutating app state', async () => {
    createMocks({
      bannerState: {
        error: 'Failed to open the PDF file.'
      }
    })

    const wrapper = mount(PdfApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.pdf-status-banner').exists()).toBe(true)

    await wrapper.find('.pdf-status-banner__dismiss').trigger('click')
    await flushPromises()

    expect(wrapper.find('.pdf-status-banner').exists()).toBe(false)
    expect(mockViewerController.error.value).toBe('Failed to open the PDF file.')

    mockViewerController.error.value = 'A different PDF error.'
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.pdf-status-banner').exists()).toBe(true)
    expect(wrapper.text()).toContain('A different PDF error.')
  })

  it('does not show export success when export fails', async () => {
    createMocks()
    mockPdfExport.exportTxt.mockImplementation(async () => {
      mockPdfExport.exportError.value = 'Failed to export as TXT.'
      return false
    })

    const wrapper = mount(PdfApp)
    await flushPromises()

    wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit('export-txt')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to export as TXT.')
    expect(wrapper.text()).not.toContain('TXT export ready')
  })

  // ── Rendering modes ──────────────────────────────────────────

  describe('rendering modes', () => {
    it('original + single renders one PdfViewer without overlay', async () => {
      createMocks()
      mockViewerMode.contentView.value = 'original'
      mockViewerMode.selectedLayoutMode.value = 'single'

      const wrapper = mount(PdfApp)
      await flushPromises()

      const viewers = wrapper.findAllComponents({ name: 'PdfViewer' })
      expect(viewers).toHaveLength(1)
      expect(viewers[0].props('viewerRole')).toBe('original')
      expect(viewers[0].props('showOverlay')).toBe(false)
      expect(wrapper.findComponent({ name: 'PdfTranslatedPane' }).exists()).toBe(false)
    })

    it('translation + single renders only PdfTranslatedPane', async () => {
      createMocks()
      mockViewerMode.contentView.value = 'translation'
      mockViewerMode.selectedLayoutMode.value = 'single'

      const wrapper = mount(PdfApp)
      await flushPromises()

      expect(wrapper.findAllComponents({ name: 'PdfViewer' })).toHaveLength(0)
      expect(wrapper.findComponent({ name: 'PdfTranslatedPane' }).exists()).toBe(true)
    })

    it('translation + side-by-side renders PdfViewer and PdfTranslatedPane', async () => {
      createMocks()
      mockViewerMode.contentView.value = 'translation'
      mockViewerMode.selectedLayoutMode.value = 'side-by-side'

      const wrapper = mount(PdfApp)
      await flushPromises()

      const viewers = wrapper.findAllComponents({ name: 'PdfViewer' })
      expect(viewers).toHaveLength(1)
      expect(viewers[0].props('viewerRole')).toBe('original')
      expect(viewers[0].props('showOverlay')).toBe(false)
      expect(viewers[0].props('scrollContainer')).toBe(wrapper.findComponent({ name: 'PdfViewerLayout' }).vm.scrollContainer)
      expect(wrapper.findComponent({ name: 'PdfTranslatedPane' }).exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'PdfTranslatedPane' }).props('scrollContainer')).toBe(wrapper.findComponent({ name: 'PdfViewerLayout' }).vm.translatedPaneRef)
    })

    it('translated-pdf + single renders one PdfViewer with overlay', async () => {
      createMocks()
      mockViewerMode.contentView.value = 'translated-pdf'
      mockViewerMode.selectedLayoutMode.value = 'single'

      const wrapper = mount(PdfApp)
      await flushPromises()

      const viewers = wrapper.findAllComponents({ name: 'PdfViewer' })
      expect(viewers).toHaveLength(1)
      expect(viewers[0].props('viewerRole')).toBe('original')
      expect(viewers[0].props('showOverlay')).toBe(true)
      expect(wrapper.findComponent({ name: 'PdfTranslatedPane' }).exists()).toBe(false)
    })

    it('translated-pdf + side-by-side renders two PdfViewers', async () => {
      createMocks()
      mockViewerMode.contentView.value = 'translated-pdf'
      mockViewerMode.selectedLayoutMode.value = 'side-by-side'

      const wrapper = mount(PdfApp)
      await flushPromises()

      const viewers = wrapper.findAllComponents({ name: 'PdfViewer' })
      expect(viewers).toHaveLength(2)

      expect(viewers[0].props('viewerRole')).toBe('original')
      expect(viewers[0].props('showOverlay')).toBe(false)
      expect(viewers[0].props('scrollContainer')).toBe(wrapper.findComponent({ name: 'PdfViewerLayout' }).vm.scrollContainer)
      expect(viewers[0].props('handleNavigationTarget')).toBeTruthy()
      expect(viewers[0].props('freezeRenderWindowEviction')).toBe(false)

      expect(viewers[1].props('viewerRole')).toBe('overlay')
      expect(viewers[1].props('showOverlay')).toBe(true)
      expect(viewers[1].props('scrollContainer')).toBe(wrapper.findComponent({ name: 'PdfViewerLayout' }).vm.translatedPaneRef)
      expect(viewers[1].props('freezeRenderWindowEviction')).toBe(false)
      expect(viewers[1].props('handleNavigationTarget')).toBeTruthy()

      expect(wrapper.findComponent({ name: 'PdfTranslatedPane' }).exists()).toBe(false)
    })
  })

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
})
