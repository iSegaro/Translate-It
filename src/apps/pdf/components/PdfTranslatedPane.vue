<template>
  <div class="pdf-translated-pane">
    <div
      v-if="!hasTranslatedData"
      class="pdf-translated-pane__empty"
    >
      <p class="pdf-translated-pane__empty-title">
        No translations yet
      </p>
      <p class="pdf-translated-pane__empty-text">
        Click "Translate Visible Pages" to see translated content here.
      </p>
    </div>

    <div
      v-else
      class="pdf-translated-pane__pages"
    >
      <div
        v-for="page in translatedPageData"
        :key="page.pageNumber"
        class="pdf-translated-page"
      >
        <div class="pdf-translated-page__header">
          Page {{ page.pageNumber }}
        </div>

        <div
          v-if="page.blocks.length === 0"
          class="pdf-translated-page__empty"
        >
          <PdfOcrStatus
            :is-scanned-candidate="page.isScannedCandidate"
            :is-ocr-complete="page.isOcrComplete"
            :ocr-error="page.ocrError"
          />
          <span v-if="!page.isScannedCandidate && !page.isOcrComplete">No text blocks on this page</span>
        </div>

        <div
          v-else
          class="pdf-translated-page__blocks"
        >
          <PdfTranslatedBlock
            v-for="block in page.blocks"
            :key="block.id"
            :block="block"
            :translation-state="block.translationState"
            :highlighted="block.id === highlightedBlockId"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import PdfTranslatedBlock from './PdfTranslatedBlock.vue'
import PdfOcrStatus from './PdfOcrStatus.vue'

const props = defineProps({
  translatedPageData: {
    type: Array,
    default: () => []
  },
  highlightedBlockId: {
    type: String,
    default: null
  }
})

const hasTranslatedData = computed(() => {
  return props.translatedPageData.some(page => page.blocks.length > 0)
})
</script>

<style scoped lang="scss">
.pdf-translated-pane {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pdf-translated-pane__empty {
  display: grid;
  place-items: center;
  min-height: 300px;
  text-align: center;
  padding: 32px;
}

.pdf-translated-pane__empty-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 8px;
}

.pdf-translated-pane__empty-text {
  margin: 0;
  color: rgba(230, 237, 247, 0.7);
  font-size: 14px;
}

.pdf-translated-pane__pages {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pdf-translated-page {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.pdf-translated-page__header {
  font-size: 13px;
  font-weight: 700;
  color: rgba(230, 237, 247, 0.68);
  margin-bottom: 12px;
}

.pdf-translated-page__empty {
  color: rgba(230, 237, 247, 0.5);
  font-size: 13px;
  font-style: italic;
}

.pdf-translated-page__blocks {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
