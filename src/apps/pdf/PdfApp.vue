<template>
  <div class="pdf-app">
    <PdfToolbar
      :file-name="fileName"
      :is-loading="isLoading"
      :is-translating="isTranslating"
      :can-translate-visible-pages="canTranslateVisiblePages"
      :can-export="canExport"
      :is-partial-export="isPartialExport"
      :is-block-targeting-active="isBlockTargetingActive"
      :scanned-page-count="scannedPageCount"
      :is-ocr-processing="isOcrProcessing"
      :viewer-mode="viewerMode"
      :translation-summary="translationSummary"
      @file-selected="handleFileSelected"
      @translate-visible="handleTranslateVisiblePages"
      @cancel-translation="handleCancelTranslation"
      @mode-change="setMode"
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

const {
  error,
  fileName,
  hasDocument,
  isLoading,
  isTranslating,
  canTranslateVisiblePages,
  pageMetrics,
  translationSummary,
  translatedPageData,
  translationTick,
  restoredTranslationCount,
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
  restoredTranslationCount: restoredTranslationCount.value,
  isPartialExport: isPartialExport.value
}))

watch(hasDocument, (has) => {
  if (has) {
    refreshOcrCandidates()
  }
})

async function handleFileSelected(file) {
  const loaded = await loadPdfFile(file, viewerWidth.value)
  if (loaded) {
    isDragOver.value = false
  }
}

function handleLayoutChange(width) {
  if (!width || width === viewerWidth.value) return

  viewerWidth.value = width
  if (hasDocument.value) {
    void recomputeLayout(width)
  }
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

<style scoped lang="scss">
.pdf-app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  --pdf-toolbar-sticky-height: 52px;
  background:
    radial-gradient(circle at top left, rgba(90, 92, 255, 0.18), transparent 35%),
    linear-gradient(180deg, #10131a 0%, #0b0e13 100%);
  color: #e6edf7;
  font-family: Inter, "Segoe UI", system-ui, sans-serif;
}

.pdf-app__content {
  flex: 1;
  padding: 16px 28px 28px;
  min-height: 0;
}

.pdf-app__status-row {
  position: sticky;
  top: var(--pdf-toolbar-sticky-height);
  z-index: 25;
  padding: 10px 28px 0;
  pointer-events: none;
}

.pdf-app__status-row :deep(.pdf-status-banner) {
  pointer-events: none;
}

.pdf-app__empty {
  min-height: 480px;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 32px;
}

.pdf-app__empty-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 8px;
}

.pdf-app__empty-text {
  margin: 0;
  color: rgba(230, 237, 247, 0.7);
}

@media (max-width: 1100px) {
  .pdf-app {
    --pdf-toolbar-sticky-height: 96px;
  }

  .pdf-app__status-row {
    padding: 8px 16px 0;
  }

  .pdf-app__content {
    padding: 16px;
  }
}
</style>
