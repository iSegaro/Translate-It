<template>
  <div class="pdf-app">
    <PdfToolbar
      :file-name="fileName"
      :page-count="pageCount"
      :current-page-number="currentPage"
      :is-loading="isLoading"
      :is-translating="isTranslating"
      :can-translate-visible-pages="canTranslateVisiblePages"
      :can-export="canExport"
      :scanned-page-count="scannedPageCount"
      :is-ocr-processing="isOcrProcessing"
      :content-view="contentView"
      :layout-mode="selectedLayoutMode"
      :zoom-mode="zoomMode"
      :zoom-percent="zoomPercent"
      :show-translation-option="hasAnyTranslation"
      :has-outline="hasOutline"
      :is-outline-visible="isOutlineVisible"
      @toggle-outline="toggleOutline"
      @translate-visible="handleTranslateVisiblePages"
      @cancel-translation="handleCancelTranslation"
      @content-view-change="handleContentViewChange"
      @layout-mode-change="handleLayoutModeChange"
      @zoom-step="handleZoomStep"
      @zoom-change="handleZoomChange"
      @export-txt="handleExportTxt"
      @export-markdown="handleExportMarkdown"
      @export-html="handleExportHtml"
      @request-ocr="requestOcr"
      @clear-cache="handleClearCache"
      @request-open-pdf="requestOpenPdf"
    />

    <input
      ref="fileInput"
      class="pdf-app__file-input"
      hidden
      type="file"
      accept="application/pdf,.pdf"
      @change="handleFileInputChange"
    >

    <div class="pdf-app__viewport">
      <div class="pdf-app__status-layer">
        <div
          v-if="isPdfStatusBannerVisible"
          class="pdf-app__status-row"
        >
          <PdfStatusBanner
            :visible="isPdfStatusBannerVisible"
            :variant="pdfStatusBanner.variant || 'info'"
            :title="pdfStatusBanner.title || ''"
            :message="pdfStatusBanner.message || ''"
            :detail="pdfStatusBanner.detail || ''"
            :dismissible="pdfStatusBanner?.dismissible ?? false"
            @dismiss="dismissPdfStatusBanner"
          />
        </div>

        <PdfOcrProgress
          :processing="isOcrProcessing"
          :progress="ocrProgress"
          @cancel="cancelOcr"
        />
      </div>

      <main class="pdf-app__content">
        <PdfOcrConsentPrompt
          :visible="isOcrPromptVisible"
          :page-count="scannedPageCount"
          @confirm="confirmOcr"
          @cancel="dismissOcrPrompt"
        />

        <div class="pdf-app__workspace">
          <PdfOutline
            :outline="pdfOutline"
            :visible="isOutlineVisible && hasOutline"
            :active-dest="activeOutlineDest"
            :expanded-dests="expandedDests"
            @close="isOutlineVisible = false"
            @navigate="handleOutlineNavigate"
          />

          <PdfDropzone
            :has-document="hasDocument"
            :is-drag-over="isDragOver"
            @file-selected="handleFileSelected"
            @drag-state-change="isDragOver = $event"
            @request-open-pdf="requestOpenPdf"
          >
            <template #empty>
              <div class="pdf-app__empty">
                <p class="pdf-app__empty-title">
                  Drop a PDF here or choose one from disk.
                </p>
              </div>
            </template>

            <template #document>
              <PdfViewerLayout
                ref="pdfViewerLayoutRef"
                :layout-mode="layoutMode"
                :show-original-pane="showOriginalPane"
                :show-translated-pane="showTranslatedTextPane || showTranslatedPdfPane"
                :suppress-scroll-sync="suppressScrollSync"
              >
                <template
                  v-if="showOriginalPane"
                  #original
                >
                  <PdfViewer
                    ref="pdfViewerRef"
                    :viewer-role="VIEWER_ROLE.ORIGINAL"
                    :pages="pageMetrics"
                    :session="session"
                    :suppress-current-page-updates="currentPageUpdatesSuppressed"
                    :freeze-render-window-eviction="renderWindowEvictionFrozen"
                    :show-overlay="showOverlayLayer"
                    :overlay-page-data="translatedPageData"
                    :handle-navigation-target="handleNavigationTarget"
                    :scroll-container="originalScrollContainer"
                    @layout-change="handleLayoutChange"
                    @current-page-change="handleCurrentPageChange"
                    @visible-pages-change="handleVisiblePagesChange"
                  />
                </template>

                <template #translated>
                  <PdfTranslatedPane
                    v-if="showTranslatedTextPane"
                    ref="pdfTranslatedPaneRef"
                    :translated-page-data="translatedPageData"
                    :page-metrics="pageMetrics"
                    :layout-mode="layoutMode"
                    :scroll-container="translatedScrollContainer"
                    :suppress-current-page-updates="currentPageUpdatesSuppressed"
                    @current-page-change="handleTranslatedPaneCurrentPageChange"
                  />
                  <PdfViewer
                    v-if="showTranslatedPdfPane"
                    :viewer-role="VIEWER_ROLE.OVERLAY"
                    :pages="pageMetrics"
                    :session="session"
                    :suppress-current-page-updates="currentPageUpdatesSuppressed"
                    :freeze-render-window-eviction="renderWindowEvictionFrozen"
                    :show-overlay="true"
                    :overlay-page-data="translatedPageData"
                    :handle-navigation-target="handleNavigationTarget"
                    :scroll-container="translatedScrollContainer"
                  />
                </template>
              </PdfViewerLayout>
            </template>
          </PdfDropzone>
        </div>
      </main>
    </div>

    <PdfWindowsHost :pdf-fingerprint="pdfFingerprint" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PdfToolbar from './components/PdfToolbar.vue'
import PdfDropzone from './components/PdfDropzone.vue'
import PdfViewer from './components/PdfViewer.vue'
import PdfViewerLayout from './components/PdfViewerLayout.vue'
import PdfTranslatedPane from './components/PdfTranslatedPane.vue'
import PdfOcrConsentPrompt from './components/PdfOcrConsentPrompt.vue'
import PdfOcrProgress from './components/PdfOcrProgress.vue'
import PdfStatusBanner from './components/PdfStatusBanner.vue'
import PdfWindowsHost from './components/PdfWindowsHost.vue'
import PdfOutline from './components/PdfOutline.vue'
import { usePdfViewerController } from './composables/usePdfViewerController.js'
import { usePdfViewerMode, CONTENT_VIEW, VIEWER_ROLE } from './composables/usePdfViewerMode.js'
import { usePdfExport } from './composables/usePdfExport.js'
import { usePdfOcr } from './composables/usePdfOcr.js'
import { usePdfNavigation } from './composables/usePdfNavigation.js'
import { usePdfKeyboard } from './composables/usePdfKeyboard.js'
import { createPdfTransitionController } from './composables/createPdfTransitionController.js'
import { createPdfStatusBannerController } from './utils/pdfStatusBanner.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { applyTheme } from '@/utils/ui/theme.js'
import './PdfApp.scss'

const {
  error,
  fileName,
  hasDocument,
  isLoading,
  isTranslating,
  canTranslateVisiblePages,
  hasAnyTranslation,
  pageCount,
  pageMetrics,
  translationSummary,
  translatedPageData,
  translationTick,
  pdfFingerprint,
  session,
  loadPdfFile,
  recomputeLayout,
  translateVisiblePages,
  hydrateVisiblePageBlocks,
  cancelTranslation,
  clearDocumentCache,
  cleanup
} = usePdfViewerController()

const {
  contentView,
  layoutMode,
  selectedLayoutMode,
  isSideBySide,
  showOriginalPane,
  showTranslatedTextPane,
  showTranslatedPdfPane,
  showOverlayLayer,
  setContentView,
  setLayoutMode
} = usePdfViewerMode()

const {
  canExport,
  exportError,
  exportTxt,
  exportMarkdown,
  exportHtml,
  clearExportError
} = usePdfExport(translationTick)

const pdfViewerRef = ref(null)
const pdfTranslatedPaneRef = ref(null)
const pdfViewerLayoutRef = ref(null)
const fileInput = ref(null)
const originalScrollContainer = computed(() => pdfViewerLayoutRef.value?.scrollContainer ?? null)
const translatedScrollContainer = computed(() => pdfViewerLayoutRef.value?.translatedPaneRef ?? null)
const {
  currentPage,
  isNavigating,
  outline: pdfOutline,
  hasOutline,
  activeOutlineDest,
  expandedDests,
  navigateToPage,
  navigateToDestination,
  handleNavigationTarget,
  attachDocument,
  detachDocument
} = usePdfNavigation(pdfViewerRef)
const exportSuccess = ref(null)
const exportSuccessTimer = ref(null)
const EXPORT_SUCCESS_DURATION_MS = 2200
const dismissedPdfStatusBannerKey = ref('')
const pdfStatusBannerController = createPdfStatusBannerController()

const {
  scannedPageCount,
  isOcrPromptVisible,
  isOcrProcessing,
  ocrProgress,
  ocrError,
  refreshOcrCandidates,
  requestOcr,
  confirmOcr,
  cancelOcr,
  dismissOcrPrompt
} = usePdfOcr({
  onOcrComplete: () => {
    translationTick.value += 1
    refreshOcrCandidates()
  }
})

usePdfKeyboard({
  currentPage,
  totalPages: pageCount,
  navigateToPage,
  containerRef: originalScrollContainer
})

  const {
    handleContentViewChange,
    handleLayoutModeChange,
    handleLayoutChange,
    handleZoomChange,
    handleZoomStep,
    buildLayoutRequest,
    resetViewerState,
    currentPageUpdatesSuppressed,
    renderWindowEvictionFrozen,
    suppressScrollSync,
    zoomMode,
    zoomPercent
  } = createPdfTransitionController({
    contentView,
    selectedLayoutMode,
    isSideBySide,
    showOriginalPane,
    showTranslatedTextPane,
    showTranslatedPdfPane,
    setContentView,
    setLayoutMode,
    session,
    hasDocument,
    recomputeLayout,
    currentPage,
    originalScrollContainer,
    translatedScrollContainer,
    pdfViewerRef,
    pdfTranslatedPaneRef,
    pdfViewerLayoutRef
  })

const isDragOver = ref(false)
const isOutlineVisible = ref(false)

const settingsStore = useSettingsStore()

let removeThemeMessageListener = null
let themeMediaQuery = null
let themeMqHandler = null

watch(() => settingsStore.settings.THEME, (theme) => {
  applyTheme(theme || 'auto')
}, { immediate: true })

function toggleOutline() {
  isOutlineVisible.value = !isOutlineVisible.value
}

function handleOutlineNavigate(dest) {
  navigateToDestination(dest)
}

const pdfStatusBanner = computed(() => pdfStatusBannerController.build({
  error: error.value,
  exportError: exportError.value,
  ocrError: ocrError.value,
  isLoading: isLoading.value,
  isTranslating: isTranslating.value,
  exportSuccess: exportSuccess.value,
  translationStatus: translationSummary.value?.status ?? 'idle',
  translationOccurrenceId: translationSummary.value?.translationOccurrenceId ?? 0
}))

const isPdfStatusBannerVisible = computed(() => {
  if (!pdfStatusBanner.value) {
    return false
  }
  const dismissed = dismissedPdfStatusBannerKey.value
  const bid = pdfStatusBanner.value.id
  if (dismissed === bid) {
    return false
  }
  return true
})

watch(hasDocument, (has) => {
  if (has) {
    refreshOcrCandidates()
  }
})

watch(hasAnyTranslation, (has) => {
  if (!has && !isTranslating.value && contentView.value !== CONTENT_VIEW.ORIGINAL) {
    setContentView(CONTENT_VIEW.ORIGINAL)
  }
})

function resetPresentationState() {
  currentPage.value = 0
  resetViewerState()
}

async function handleFileSelected(file) {
  resetPresentationState()
  const loaded = await loadPdfFile(file, buildLayoutRequest())
  if (loaded) {
    isDragOver.value = false
    void attachDocument(session)
  }
}

function requestOpenPdf() {
  const input = fileInput.value
  if (!input) return

  input.value = ''
  input.click()
}

async function handleFileInputChange(event) {
  const [file] = event.target.files || []

  try {
    if (file) {
      await handleFileSelected(file)
    }
  } finally {
    event.target.value = ''
  }
}

function handleCurrentPageChange(pageNumber) {
  if (isNavigating.value) return
  if (!Number.isFinite(Number(pageNumber))) return
  currentPage.value = Number(pageNumber) || 0
}

function handleVisiblePagesChange(pageNumbers) {
  if (contentView.value !== CONTENT_VIEW.TRANSLATED_PDF) return
  const pages = new Set(pageNumbers || [])
  if (pages.size === 0) return

  void hydrateVisiblePageBlocks(pages)
}

function handleTranslatedPaneCurrentPageChange(pageNumber) {
  if (showOriginalPane.value) return
  handleCurrentPageChange(pageNumber)
}

function handleTranslateVisiblePages() {
  void translateVisiblePages()
}

function handleCancelTranslation() {
  void cancelTranslation()
}

async function handleExportTxt() {
  clearExportSuccess()
  clearExportError()
  if (await exportTxt()) {
    showExportSuccess('TXT')
  }
}

async function handleExportMarkdown() {
  clearExportSuccess()
  clearExportError()
  if (await exportMarkdown()) {
    showExportSuccess('Markdown')
  }
}

async function handleExportHtml() {
  clearExportSuccess()
  clearExportError()
  const canvasDataUrls = pdfViewerRef.value?.collectCanvasDataUrls?.() || new Map()
  if (await exportHtml(canvasDataUrls)) {
    showExportSuccess('HTML')
  }
}

function handleClearCache() {
  void clearDocumentCache()
}

function dismissPdfStatusBanner() {
  if (!pdfStatusBanner.value?.id || !pdfStatusBanner.value.dismissible) {
    return
  }
  dismissedPdfStatusBannerKey.value = pdfStatusBanner.value.id
}

function clearExportSuccess() {
  if (exportSuccessTimer.value) {
    clearTimeout(exportSuccessTimer.value)
    exportSuccessTimer.value = null
  }

  exportSuccess.value = null
}

function showExportSuccess(formatLabel) {
  clearExportSuccess()
  exportSuccess.value = {
    variant: 'success',
    title: `${formatLabel} export ready`,
    message: `${formatLabel} export downloaded successfully.`,
    detail: ''
  }

  exportSuccessTimer.value = setTimeout(() => {
    exportSuccess.value = null
    exportSuccessTimer.value = null
  }, EXPORT_SUCCESS_DURATION_MS)
}

onMounted(() => {
  if (import.meta.env.DEV) {
    import('./debug/pdfOverlayDiagnostics.js')
  }

  const handler = (message) => {
    if (message.action === 'THEME_CHANGED') {
      applyTheme(message.payload.theme)
    }
  }
  browser.runtime.onMessage.addListener(handler)
  removeThemeMessageListener = () => browser.runtime.onMessage.removeListener(handler)

  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const mqHandler = () => {
    if (settingsStore.settings.THEME === 'auto') {
      applyTheme('auto')
    }
  }
  mq.addEventListener('change', mqHandler)
  themeMediaQuery = mq
  themeMqHandler = mqHandler
})

onBeforeUnmount(() => {
  clearExportSuccess()
  detachDocument()
  void cleanup()

  if (removeThemeMessageListener) {
    removeThemeMessageListener()
    removeThemeMessageListener = null
  }
  if (themeMediaQuery && themeMqHandler) {
    themeMediaQuery.removeEventListener('change', themeMqHandler)
  }
})
</script>
