import { afterEach, describe, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import PdfApp from './PdfApp.vue'

let mockViewerController
let mockViewerMode
let mockPdfExport
let mockBlockSelection
let mockPdfOcr
let mockLayoutSyncFromPane
let mockPdfViewport

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

vi.mock('./composables/usePdfBlockSelection.js', () => ({
  usePdfBlockSelection: () => mockBlockSelection
}))

vi.mock('./composables/usePdfOcr.js', () => ({
  usePdfOcr: () => mockPdfOcr
}))

vi.mock('./components/PdfToolbar.vue', () => ({
  default: {
    name: 'PdfToolbar',
    props: ['fileName', 'pageCount', 'currentPageNumber', 'zoomMode', 'zoomPercent', 'contentView', 'layoutMode'],
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
    props: ['showOriginalPane', 'showTranslatedPane'],
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
    props: ['viewerRole', 'showOverlay', 'isBlockTargetingActive', 'highlightedBlockId', 'handleNavigationTarget', 'scrollContainer'],
    template: '<div class="pdf-viewer-stub" />'
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
  default: {
    name: 'PdfWindowsHost',
    template: '<div class="pdf-windows-host-stub" />'
  }
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
    cancelTranslation: vi.fn(),
    clearDocumentCache: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn()
  }

  mockViewerMode = {
    contentView: ref('translated-pdf'),
    layoutMode: ref('single'),
    showOriginalPane: ref(true),
    showTranslatedTextPane: ref(false),
    showTranslatedPdfPane: ref(false),
    showOverlayLayer: ref(true),
    isSideBySide: ref(false),
    setContentView: vi.fn((value) => {
      mockViewerMode.contentView.value = value
      updateModeDerivedState()
    }),
    setLayoutMode: vi.fn((value) => {
      mockViewerMode.layoutMode.value = value
      updateModeDerivedState()
    })
  }
  mockLayoutSyncFromPane = vi.fn()
  mockPdfViewport = {
    convertToPdfPoint: vi.fn((x, y) => [x / 2, y / 2]),
    convertToViewportPoint: vi.fn((x, y) => [x * 2, y * 2])
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

function updateModeDerivedState() {
  const contentView = mockViewerMode.contentView.value
  const layoutMode = mockViewerMode.layoutMode.value
  const isSideBySide = layoutMode === 'side-by-side' && contentView !== 'original'

  mockViewerMode.isSideBySide.value = isSideBySide
  mockViewerMode.showOriginalPane.value = contentView !== 'translation' || isSideBySide
  mockViewerMode.showTranslatedTextPane.value = contentView === 'translation'
  mockViewerMode.showTranslatedPdfPane.value = contentView === 'translated-pdf' && isSideBySide
  mockViewerMode.showOverlayLayer.value = contentView === 'translated-pdf' && !isSideBySide
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

  // ── Rendering modes ──────────────────────────────────────────

  describe('rendering modes', () => {
    it('original + single renders one PdfViewer without overlay', async () => {
      createMocks()
      mockViewerMode.contentView.value = 'original'
      mockViewerMode.layoutMode.value = 'single'
      mockViewerMode.showOriginalPane.value = true
      mockViewerMode.showTranslatedTextPane.value = false
      mockViewerMode.showTranslatedPdfPane.value = false
      mockViewerMode.showOverlayLayer.value = false

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
      mockViewerMode.layoutMode.value = 'single'
      mockViewerMode.showOriginalPane.value = false
      mockViewerMode.showTranslatedTextPane.value = true
      mockViewerMode.showTranslatedPdfPane.value = false
      mockViewerMode.showOverlayLayer.value = false

      const wrapper = mount(PdfApp)
      await flushPromises()

      expect(wrapper.findAllComponents({ name: 'PdfViewer' })).toHaveLength(0)
      expect(wrapper.findComponent({ name: 'PdfTranslatedPane' }).exists()).toBe(true)
    })

    it('translation + side-by-side renders PdfViewer and PdfTranslatedPane', async () => {
      createMocks()
      mockViewerMode.contentView.value = 'translation'
      mockViewerMode.layoutMode.value = 'side-by-side'
      mockViewerMode.showOriginalPane.value = true
      mockViewerMode.showTranslatedTextPane.value = true
      mockViewerMode.showTranslatedPdfPane.value = false
      mockViewerMode.showOverlayLayer.value = false
      mockViewerMode.isSideBySide.value = true

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
      mockViewerMode.layoutMode.value = 'single'
      mockViewerMode.showOriginalPane.value = true
      mockViewerMode.showTranslatedTextPane.value = false
      mockViewerMode.showTranslatedPdfPane.value = false
      mockViewerMode.showOverlayLayer.value = true
      mockViewerMode.isSideBySide.value = false

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
      mockViewerMode.layoutMode.value = 'side-by-side'
      mockViewerMode.showOriginalPane.value = true
      mockViewerMode.showTranslatedTextPane.value = false
      mockViewerMode.showTranslatedPdfPane.value = true
      mockViewerMode.showOverlayLayer.value = false
      mockViewerMode.isSideBySide.value = true

      const wrapper = mount(PdfApp)
      await flushPromises()

      const viewers = wrapper.findAllComponents({ name: 'PdfViewer' })
      expect(viewers).toHaveLength(2)

      expect(viewers[0].props('viewerRole')).toBe('original')
      expect(viewers[0].props('showOverlay')).toBe(false)
      expect(viewers[0].props('scrollContainer')).toBe(wrapper.findComponent({ name: 'PdfViewerLayout' }).vm.scrollContainer)
      expect(viewers[0].props('isBlockTargetingActive')).toBe(false)
      expect(viewers[0].props('highlightedBlockId')).toBe('')
      expect(viewers[0].props('handleNavigationTarget')).toBeTruthy()

      expect(viewers[1].props('viewerRole')).toBe('overlay')
      expect(viewers[1].props('showOverlay')).toBe(true)
      expect(viewers[1].props('scrollContainer')).toBe(wrapper.findComponent({ name: 'PdfViewerLayout' }).vm.translatedPaneRef)
      expect(viewers[1].props('isBlockTargetingActive')).toBeUndefined()
      expect(viewers[1].props('highlightedBlockId')).toBeUndefined()
      expect(viewers[1].props('handleNavigationTarget')).toBeUndefined()

      expect(wrapper.findComponent({ name: 'PdfTranslatedPane' }).exists()).toBe(false)
    })
  })

  describe('scroll anchor ownership transitions', () => {
    function mountInMode({ contentView, layoutMode, sessionAsRef = true }) {
      createMocks({ sessionAsRef })
      mockViewerMode.contentView.value = contentView
      mockViewerMode.layoutMode.value = layoutMode
      updateModeDerivedState()
      return mount(PdfApp)
    }

    async function emitToolbar(wrapper, eventName, value) {
      wrapper.findComponent({ name: 'PdfToolbar' }).vm.$emit(eventName, value)
      await flushPromises()
    }

    it('keeps translated pane as final writer for translation single to side-by-side', async () => {
      const wrapper = mountInMode({ contentView: 'translation', layoutMode: 'single' })
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
      const wrapper = mountInMode({ contentView: 'translation', layoutMode: 'side-by-side' })
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
      const wrapper = mountInMode({ contentView: 'translated-pdf', layoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      layout.scrollContainer.scrollTop = 100

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')

      expect(mockViewerMode.setLayoutMode).toHaveBeenCalledWith('side-by-side')
      expect(layout.scrollContainer.scrollTop).toBe(100)
      expect(mockLayoutSyncFromPane).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('uses pdf-backed anchors for translated-pdf layout mode toggles', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', layoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 900

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')

      expect(mockPdfViewport.convertToPdfPoint).toHaveBeenCalledWith(150, 36)
      expect(mockPdfViewport.convertToViewportPoint).not.toHaveBeenCalled()
      expect(originalPane.scrollTop).toBe(900)

      wrapper.unmount()
    })

    it('defers pdf-backed scroll restore on repeated translated-pdf layout toggles', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', layoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 900

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')
      expect(originalPane.scrollTop).toBe(900)

      await emitToolbar(wrapper, 'layout-mode-change', 'single')
      expect(originalPane.scrollTop).toBe(900)

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')
      expect(originalPane.scrollTop).toBe(900)

      expect(mockPdfViewport.convertToPdfPoint).toHaveBeenCalledTimes(3)
      expect(mockPdfViewport.convertToViewportPoint).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('uses pdf-backed anchors when translated-pdf layout recomputes page metrics', async () => {
      const wrapper = mountInMode({ contentView: 'translated-pdf', layoutMode: 'single' })
      await flushPromises()

      const layout = wrapper.findComponent({ name: 'PdfViewerLayout' }).vm
      const originalPane = layout.scrollContainer
      originalPane.scrollTop = 900

      await emitToolbar(wrapper, 'layout-mode-change', 'side-by-side')
      await waitAnimationFrame()
      await flushPromises()

      mockPdfViewport.convertToPdfPoint.mockClear()
      mockPdfViewport.convertToViewportPoint.mockClear()
      mockViewerController.recomputeLayout.mockClear()
      originalPane.scrollTop = 760

      wrapper.findComponent({ name: 'PdfViewer' }).vm.$emit('layout-change', { width: 800, height: 600 })
      await flushPromises()

      expect(mockViewerController.recomputeLayout).toHaveBeenCalled()
      expect(mockPdfViewport.convertToPdfPoint).toHaveBeenCalledWith(150, -64)
      expect(originalPane.scrollTop).toBe(760)

      wrapper.unmount()
    })

    it('preserves page when switching original to translation', async () => {
      const wrapper = mountInMode({ contentView: 'original', layoutMode: 'single' })
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
      const wrapper = mountInMode({ contentView: 'translation', layoutMode: 'single' })
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
      const wrapper = mountInMode({ contentView: 'original', layoutMode: 'single' })
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

    it('uses logical current page when translated DOM capture is stale during translation to translated-pdf', async () => {
      const wrapper = mountInMode({ contentView: 'original', layoutMode: 'single' })
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
      const wrapper = mountInMode({ contentView: 'original', layoutMode: 'side-by-side' })
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
        layoutMode: 'side-by-side',
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
      const wrapper = mountInMode({ contentView: 'original', layoutMode: 'side-by-side' })
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
      const wrapper = mountInMode({ contentView: 'original', layoutMode: 'side-by-side' })
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
