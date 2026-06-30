import { afterEach, describe, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import PdfApp from './PdfApp.vue'

let mockViewerController
let mockBilingualMode
let mockPdfExport
let mockBlockSelection
let mockPdfOcr

vi.mock('./composables/usePdfViewerController.js', () => ({
  usePdfViewerController: () => mockViewerController
}))

vi.mock('./composables/usePdfBilingualMode.js', () => ({
  usePdfBilingualMode: () => mockBilingualMode
}))

vi.mock('./composables/usePdfExport.js', () => ({
  usePdfExport: () => mockPdfExport
}))

vi.mock('./composables/usePdfBlockSelection.js', () => ({
  usePdfBlockSelection: () => mockBlockSelection
}))

vi.mock('./composables/usePdfOcr.js', () => ({
  usePdfOcr: () => mockPdfOcr
}))

vi.mock('./components/PdfToolbar.vue', () => ({
  default: {
    name: 'PdfToolbar',
    props: ['fileName', 'pageCount', 'currentPageNumber', 'zoomMode', 'zoomPercent'],
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
    template: '<div class="pdf-viewer-layout-stub"><slot name="original" /><slot name="translated" /></div>'
  }
}))

vi.mock('./components/PdfViewer.vue', () => ({
  default: {
    name: 'PdfViewer',
    template: '<div class="pdf-viewer-stub" />'
  }
}))

vi.mock('./components/PdfTranslatedPane.vue', () => ({
  default: {
    name: 'PdfTranslatedPane',
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
  default: {
    name: 'PdfWindowsHost',
    template: '<div class="pdf-windows-host-stub" />'
  }
}))

vi.mock('./debug/pdfOverlayDiagnostics.js', () => ({}))

const flushPromises = () => nextTick()

function createMocks({
  bannerState = null,
  hasDocument = true
} = {}) {
  mockViewerController = {
    error: ref(''),
    fileName: ref('demo.pdf'),
    hasDocument: ref(hasDocument),
    isLoading: ref(false),
    isTranslating: ref(false),
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
    session: ref(null),
    loadPdfFile: vi.fn().mockResolvedValue(true),
    recomputeLayout: vi.fn().mockResolvedValue(undefined),
    translateVisiblePages: vi.fn(),
    cancelTranslation: vi.fn(),
    clearDocumentCache: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn()
  }

  mockBilingualMode = {
    viewerMode: ref('translated-pdf'),
    showOriginalPane: ref(true),
    showTranslatedPane: ref(true),
    showOverlayLayer: ref(true),
    setMode: vi.fn()
  }

  mockPdfExport = {
    canExport: ref(false),
    isPartialExport: ref(false),
    exportError: ref(''),
    exportTxt: vi.fn().mockReturnValue(false),
    exportMarkdown: vi.fn().mockReturnValue(false),
    exportHtml: vi.fn().mockReturnValue(false),
    clearExportError: vi.fn()
  }

  mockBlockSelection = {
    isBlockTargetingActive: ref(false),
    highlightedBlockId: ref(''),
    toggleBlockTargeting: vi.fn(),
    handleBlockPointerMove: vi.fn(),
    handleBlockClick: vi.fn()
  }

  mockPdfOcr = {
    scannedPageCount: ref(0),
    isOcrPromptVisible: ref(false),
    isOcrProcessing: ref(false),
    ocrProgress: ref(0),
    ocrError: ref(''),
    refreshOcrCandidates: vi.fn(),
    requestOcr: vi.fn(),
    confirmOcr: vi.fn(),
    cancelOcr: vi.fn(),
    dismissOcrPrompt: vi.fn()
  }

  if (bannerState) {
    mockViewerController.isLoading.value = Boolean(bannerState.isLoading)
    mockViewerController.isTranslating.value = Boolean(bannerState.isTranslating)
    mockViewerController.restoredTranslationCount.value = bannerState.restoredTranslationCount ?? 0
    mockPdfExport.isPartialExport.value = Boolean(bannerState.isPartialExport)
    mockViewerController.error.value = bannerState.error || ''
    mockPdfExport.exportError.value = bannerState.exportError || ''
    mockPdfOcr.ocrError.value = bannerState.ocrError || ''
  }
}

describe('PdfApp', () => {
  beforeEach(() => {
    vi.useRealTimers()
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

  it('shows a transient TXT export success banner', async () => {
    vi.useFakeTimers()
    createMocks()
    mockPdfExport.exportTxt.mockReturnValue(true)

    const wrapper = mount(PdfApp)
    await flushPromises()

    wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit('export-txt')
    await flushPromises()

    expect(wrapper.text()).toContain('TXT export ready')
    expect(wrapper.text()).toContain('TXT export downloaded successfully.')

    vi.advanceTimersByTime(2200)
    await flushPromises()

    expect(wrapper.find('.pdf-status-banner').exists()).toBe(false)
  })

  it('shows a Markdown export success banner', async () => {
    createMocks()
    mockPdfExport.exportMarkdown.mockReturnValue(true)

    const wrapper = mount(PdfApp)
    await flushPromises()

    wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit('export-markdown')
    await flushPromises()

    expect(wrapper.text()).toContain('Markdown export ready')
    expect(wrapper.text()).toContain('Markdown export downloaded successfully.')
  })

  it('shows an HTML export success banner', async () => {
    createMocks()
    mockPdfExport.exportHtml.mockReturnValue(true)

    const wrapper = mount(PdfApp)
    await flushPromises()

    wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit('export-html')
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

  it('does not show export success when export fails', async () => {
    createMocks()
    mockPdfExport.exportTxt.mockImplementation(() => {
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
})
