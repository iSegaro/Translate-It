<template>
  <div class="pdf-app">
    <PdfToolbar
      :file-name="fileName"
      :page-count="pageCount"
      :current-page-number="currentPageNumber"
      :is-loading="isLoading"
      :is-translating="isTranslating"
      :can-translate-visible-pages="canTranslateVisiblePages"
      :can-export="canExport"
      :is-block-targeting-active="isBlockTargetingActive"
      :scanned-page-count="scannedPageCount"
      :is-ocr-processing="isOcrProcessing"
      :viewer-mode="viewerMode"
      :zoom-mode="zoomMode"
      :zoom-percent="zoomPercent"
      :translation-summary="translationSummary"
      @file-selected="handleFileSelected"
      @translate-visible="handleTranslateVisiblePages"
      @cancel-translation="handleCancelTranslation"
      @mode-change="setMode"
      @zoom-step="handleZoomStep"
      @zoom-change="handleZoomChange"
      @export-txt="handleExportTxt"
      @export-markdown="handleExportMarkdown"
      @export-html="handleExportHtml"
      @toggle-block-targeting="toggleBlockTargeting"
      @request-ocr="requestOcr"
      @clear-cache="handleClearCache"
    />

    <div
      v-if="pdfStatusBanner"
      class="pdf-app__status-row"
    >
      <PdfStatusBanner
        :visible="Boolean(pdfStatusBanner)"
        :variant="pdfStatusBanner.variant || 'info'"
        :title="pdfStatusBanner.title || ''"
        :message="pdfStatusBanner.message || ''"
        :detail="pdfStatusBanner.detail || ''"
      />
    </div>

    <main class="pdf-app__content">
      <PdfOcrConsentPrompt
        :visible="isOcrPromptVisible"
        :page-count="scannedPageCount"
        @confirm="confirmOcr"
        @cancel="dismissOcrPrompt"
      />

      <PdfOcrProgress
        :processing="isOcrProcessing"
        :progress="ocrProgress"
        @cancel="cancelOcr"
      />

      <PdfDropzone
        :has-document="hasDocument"
        :is-drag-over="isDragOver"
        @file-selected="handleFileSelected"
        @drag-state-change="isDragOver = $event"
      >
        <template #empty>
          <div class="pdf-app__empty">
            <p class="pdf-app__empty-title">
              Drop a PDF here or choose one from disk.
            </p>
            <p class="pdf-app__empty-text">
              This MVP uses the dedicated viewer only. No native browser interception is active.
            </p>
          </div>
        </template>

        <template #document>
          <PdfViewerLayout
            :viewer-mode="viewerMode"
            :show-original-pane="showOriginalPane"
            :show-translated-pane="showTranslatedPane"
          >
            <template
              v-if="showOriginalPane"
              #original
            >
              <PdfViewer
                ref="pdfViewerRef"
                :pages="pageMetrics"
                :session="session"
                :is-block-targeting-active="isBlockTargetingActive"
                :highlighted-block-id="highlightedBlockId"
                :show-overlay="showOverlayLayer"
                :overlay-page-data="translatedPageData"
                @layout-change="handleLayoutChange"
                @current-page-change="handleCurrentPageChange"
                @block-pointer-move="handleBlockPointerMove"
                @block-click="handleBlockClick"
              />
            </template>

            <template
              v-if="showTranslatedPane"
              #translated
            >
              <PdfTranslatedPane
                :translated-page-data="translatedPageData"
                :highlighted-block-id="highlightedBlockId"
                @current-page-change="handleTranslatedPaneCurrentPageChange"
              />
            </template>
          </PdfViewerLayout>
        </template>
      </PdfDropzone>

    </main>

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
import { usePdfViewerController } from './composables/usePdfViewerController.js'
import { usePdfBilingualMode } from './composables/usePdfBilingualMode.js'
import { usePdfExport } from './composables/usePdfExport.js'
import { usePdfBlockSelection } from './composables/usePdfBlockSelection.js'
import { usePdfOcr } from './composables/usePdfOcr.js'
import { buildPdfStatusBannerState } from './utils/pdfStatusBanner.js'
import './PdfApp.scss'

const {
  error,
  fileName,
  hasDocument,
  isLoading,
  isTranslating,
  canTranslateVisiblePages,
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
  cancelTranslation,
  clearDocumentCache,
  cleanup
} = usePdfViewerController()

const {
  viewerMode,
  showOriginalPane,
  showTranslatedPane,
  showOverlayLayer,
  setMode
} = usePdfBilingualMode()

const {
  canExport,
  isPartialExport,
  exportError,
  exportTxt,
  exportMarkdown,
  exportHtml,
  clearExportError
} = usePdfExport(translationTick)

const pdfViewerRef = ref(null)
const exportSuccess = ref(null)
const exportSuccessTimer = ref(null)
const EXPORT_SUCCESS_DURATION_MS = 2200
const currentPageNumber = ref(0)
const zoomMode = ref('fit-width')
const zoomPercent = ref(100)
const zoomPercentOptions = [50, 75, 100, 125, 150, 200]

const {
  isBlockTargetingActive,
  highlightedBlockId,
  toggleBlockTargeting,
  handleBlockPointerMove,
  handleBlockClick
} = usePdfBlockSelection()

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

const isDragOver = ref(false)
const viewerWidth = ref(960)

const pdfStatusBanner = computed(() => buildPdfStatusBannerState({
  error: error.value,
  exportError: exportError.value,
  ocrError: ocrError.value,
  isLoading: isLoading.value,
  isTranslating: isTranslating.value,
  exportSuccess: exportSuccess.value,
  isPartialExport: isPartialExport.value
}))

const zoomMultiplier = computed(() => {
  if (zoomMode.value === 'fit-width') return 1
  return zoomPercent.value / 100
})

watch(hasDocument, (has) => {
  if (has) {
    refreshOcrCandidates()
  }
})

async function handleFileSelected(file) {
  resetPresentationState()
  const loaded = await loadPdfFile(file, getEffectiveViewerWidth())
  if (loaded) {
    isDragOver.value = false
    currentPageNumber.value = pageCount.value > 0 ? 1 : 0
  }
}

function handleLayoutChange(width) {
  if (!width || width === viewerWidth.value) return

  viewerWidth.value = width
  if (hasDocument.value) {
    void recomputeLayout(getEffectiveViewerWidth(width))
  }
}

function handleCurrentPageChange(pageNumber) {
  if (!Number.isFinite(Number(pageNumber))) return
  currentPageNumber.value = Number(pageNumber) || 0
}

function handleTranslatedPaneCurrentPageChange(pageNumber) {
  if (showOriginalPane.value) return
  handleCurrentPageChange(pageNumber)
}

function handleZoomChange({ mode, value }) {
  const nextMode = mode === 'fit-width' ? 'fit-width' : 'percent'
  const nextPercent = nextMode === 'fit-width' ? 100 : clampZoomPercent(Number(value))
  const currentMode = zoomMode.value
  const currentPercent = zoomPercent.value

  if (currentMode === nextMode && currentPercent === nextPercent) {
    return
  }

  if (nextMode === 'fit-width') {
    zoomMode.value = 'fit-width'
    zoomPercent.value = 100
  } else if (Number.isFinite(Number(value))) {
    zoomMode.value = 'percent'
    zoomPercent.value = nextPercent
  }

  if (hasDocument.value) {
    void recomputeLayout(getEffectiveViewerWidth())
  }
}

function handleZoomStep(direction) {
  const currentPercent = zoomMode.value === 'percent' ? zoomPercent.value : 100
  const currentIndex = zoomPercentOptions.indexOf(currentPercent)
  const safeIndex = currentIndex >= 0 ? currentIndex : zoomPercentOptions.indexOf(100)
  const nextIndex = Math.min(
    zoomPercentOptions.length - 1,
    Math.max(0, safeIndex + Number(direction || 0))
  )
  const nextPercent = zoomPercentOptions[nextIndex] || 100

  if (zoomMode.value === 'percent' && zoomPercent.value === nextPercent) {
    return
  }

  zoomMode.value = 'percent'
  zoomPercent.value = nextPercent

  if (hasDocument.value) {
    void recomputeLayout(getEffectiveViewerWidth())
  }
}

function resetPresentationState() {
  currentPageNumber.value = 0
  zoomMode.value = 'fit-width'
  zoomPercent.value = 100
}

function handleTranslateVisiblePages() {
  void translateVisiblePages()
}

function handleCancelTranslation() {
  void cancelTranslation()
}

function handleExportTxt() {
  clearExportSuccess()
  clearExportError()
  if (exportTxt()) {
    showExportSuccess('TXT')
  }
}

function handleExportMarkdown() {
  clearExportSuccess()
  clearExportError()
  if (exportMarkdown()) {
    showExportSuccess('Markdown')
  }
}

function handleExportHtml() {
  clearExportSuccess()
  clearExportError()
  const canvasDataUrls = pdfViewerRef.value?.collectCanvasDataUrls?.() || new Map()
  if (exportHtml(canvasDataUrls)) {
    showExportSuccess('HTML')
  }
}

function handleClearCache() {
  void clearDocumentCache()
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

function clampZoomPercent(value) {
  const nearest = zoomPercentOptions.reduce((best, option) => {
    if (!best) return option
    return Math.abs(option - value) < Math.abs(best - value) ? option : best
  }, 0)

  return nearest || 100
}

function getEffectiveViewerWidth(width = viewerWidth.value) {
  const baseWidth = Number(width) || 0
  if (baseWidth <= 0) return baseWidth
  return Math.max(1, Math.round(baseWidth * zoomMultiplier.value))
}

onMounted(() => {
  if (import.meta.env.DEV) {
    import('./debug/pdfOverlayDiagnostics.js')
  }
})

onBeforeUnmount(() => {
  clearExportSuccess()
  void cleanup()
})
</script>


