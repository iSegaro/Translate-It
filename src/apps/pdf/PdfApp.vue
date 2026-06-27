<template>
  <div class="pdf-app">
    <PdfToolbar
      :file-name="fileName"
      :page-count="pageCount"
      :worker-label="workerLabel"
      :is-loading="isLoading"
      :is-translating="isTranslating"
      :can-translate-visible-pages="canTranslateVisiblePages"
      :can-export="canExport"
      :is-partial-export="isPartialExport"
      :is-block-targeting-active="isBlockTargetingActive"
      :scanned-page-count="scannedPageCount"
      :is-ocr-processing="isOcrProcessing"
      :restored-translation-count="restoredTranslationCount"
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

      <section
        v-if="error || exportError || ocrError || selectionTranslationError"
        class="pdf-app__error"
      >
        {{ error || exportError || ocrError || selectionTranslationError }}
      </section>
    </main>

    <PdfWindowsHost :pdf-fingerprint="pdfFingerprint" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PdfToolbar from './components/PdfToolbar.vue'
import PdfDropzone from './components/PdfDropzone.vue'
import PdfViewer from './components/PdfViewer.vue'
import PdfViewerLayout from './components/PdfViewerLayout.vue'
import PdfTranslatedPane from './components/PdfTranslatedPane.vue'
import PdfOcrConsentPrompt from './components/PdfOcrConsentPrompt.vue'
import PdfOcrProgress from './components/PdfOcrProgress.vue'
import PdfWindowsHost from './components/PdfWindowsHost.vue'
import { usePdfViewerController } from './composables/usePdfViewerController.js'
import { usePdfBilingualMode } from './composables/usePdfBilingualMode.js'
import { usePdfExport } from './composables/usePdfExport.js'
import { usePdfBlockSelection } from './composables/usePdfBlockSelection.js'
import { usePdfOcr } from './composables/usePdfOcr.js'

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
  restoredTranslationCount,
  pdfFingerprint,
  workerLabel,
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
  clearExportError()
  exportTxt()
}

function handleExportMarkdown() {
  clearExportError()
  exportMarkdown()
}

function handleExportHtml() {
  clearExportError()
  const canvasDataUrls = pdfViewerRef.value?.collectCanvasDataUrls?.() || new Map()
  exportHtml(canvasDataUrls)
}

function handleClearCache() {
  void clearDocumentCache()
}

onMounted(() => {
  if (import.meta.env.DEV) {
    import('./debug/pdfOverlayDiagnostics.js')
  }
})

onBeforeUnmount(() => {
  void cleanup()
})
</script>

<style scoped lang="scss">
.pdf-app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(90, 92, 255, 0.18), transparent 35%),
    linear-gradient(180deg, #10131a 0%, #0b0e13 100%);
  color: #e6edf7;
  font-family: Inter, "Segoe UI", system-ui, sans-serif;
}

.pdf-app__content {
  flex: 1;
  padding: 20px 28px 28px;
  min-height: 0;
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

.pdf-app__error {
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.14);
  color: #fecaca;
}

@media (max-width: 960px) {
  .pdf-app__content {
    padding: 16px;
  }
}
</style>
