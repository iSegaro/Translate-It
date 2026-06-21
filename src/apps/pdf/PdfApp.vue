<template>
  <div class="pdf-app">
    <PdfToolbar
      :file-name="fileName"
      :page-count="pageCount"
      :worker-label="workerLabel"
      :is-loading="isLoading"
      :is-translating="isTranslating"
      :can-translate-visible-pages="canTranslateVisiblePages"
      :translation-summary="translationSummary"
      @file-selected="handleFileSelected"
      @translate-visible="handleTranslateVisiblePages"
    />

    <main class="pdf-app__content">
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
          <div class="pdf-app__document">
            <PdfViewer
              :pages="pageMetrics"
              :session="session"
              @layout-change="handleLayoutChange"
            />
          </div>
        </template>
      </PdfDropzone>

      <section
        v-if="error"
        class="pdf-app__error"
      >
        {{ error }}
      </section>
    </main>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import PdfToolbar from './components/PdfToolbar.vue'
import PdfDropzone from './components/PdfDropzone.vue'
import PdfViewer from './components/PdfViewer.vue'
import { usePdfViewerController } from './composables/usePdfViewerController.js'

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
  workerLabel,
  session,
  loadPdfFile,
  recomputeLayout,
  translateVisiblePages,
  cleanup
} = usePdfViewerController()

const isDragOver = ref(false)
const viewerWidth = ref(960)

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

.pdf-app__document {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
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
