<template>
  <header class="pdf-toolbar">
    <div class="pdf-toolbar__title-block">
      <p class="pdf-toolbar__eyebrow">
        Translate It
      </p>
      <h1>PDF Viewer</h1>
      <p class="pdf-toolbar__subtitle">
        Dedicated viewer only. Load a PDF manually to inspect visible pages.
      </p>

      <div
        v-if="fileName"
        class="pdf-toolbar__meta"
      >
        <span>{{ fileName }}</span>
        <span>{{ pageCount }} pages</span>
        <span>Worker: {{ workerLabel }}</span>
        <span
          v-if="translationSummary.totalCount > 0"
          class="pdf-toolbar__progress"
        >
          {{ translationStatusLabel }}
        </span>
        <span
          v-if="isPartialExport"
          class="pdf-toolbar__partial-warning"
        >
          Partial export — not all blocks are translated
        </span>
        <span
          v-if="restoredTranslationCount > 0"
          class="pdf-toolbar__restore-status"
        >
          Restored {{ restoredTranslationCount }} cached translation(s)
        </span>
      </div>
    </div>

    <div class="pdf-toolbar__actions">
      <div
        v-if="fileName"
        class="pdf-toolbar__mode-group"
      >
        <button
          v-for="modeOption in modeOptions"
          :key="modeOption.value"
          class="pdf-toolbar__mode-button"
          :class="{ 'pdf-toolbar__mode-button--active': viewerMode === modeOption.value }"
          type="button"
          @click="$emit('mode-change', modeOption.value)"
        >
          {{ modeOption.label }}
        </button>
      </div>

      <button
        v-if="fileName"
        class="pdf-toolbar__button pdf-toolbar__button--targeting"
        :class="{ 'pdf-toolbar__button--targeting-active': isBlockTargetingActive }"
        type="button"
        @click="$emit('toggle-block-targeting')"
      >
        {{ isBlockTargetingActive ? 'Cancel Selection' : 'Select Block' }}
      </button>

      <button
        v-if="scannedPageCount > 0 && !isOcrProcessing"
        class="pdf-toolbar__button pdf-toolbar__button--ocr"
        type="button"
        @click="$emit('request-ocr')"
      >
        OCR Pages ({{ scannedPageCount }})
      </button>

      <span
        v-if="isOcrProcessing"
        class="pdf-toolbar__ocr-status"
      >
        OCR processing...
      </span>

      <button
        class="pdf-toolbar__button"
        type="button"
        :disabled="isLoading"
        @click="openFilePicker"
      >
        {{ isLoading ? 'Loading...' : 'Open PDF' }}
      </button>

      <button
        v-if="isTranslating"
        class="pdf-toolbar__button pdf-toolbar__button--cancel"
        type="button"
        @click="$emit('cancel-translation')"
      >
        Cancel
      </button>

      <button
        class="pdf-toolbar__button pdf-toolbar__button--accent"
        type="button"
        :disabled="!canTranslateVisiblePages"
        @click="$emit('translate-visible')"
      >
        {{ isTranslating ? 'Translating...' : 'Translate Visible Pages' }}
      </button>

      <div
        v-if="fileName && canExport"
        class="pdf-toolbar__export-group"
      >
        <button
          class="pdf-toolbar__button pdf-toolbar__button--export"
          type="button"
          @click="$emit('export-txt')"
        >
          Export TXT
        </button>
        <button
          class="pdf-toolbar__button pdf-toolbar__button--export"
          type="button"
          @click="$emit('export-markdown')"
        >
          Export Markdown
        </button>
        <button
          class="pdf-toolbar__button pdf-toolbar__button--export"
          type="button"
          @click="$emit('export-html')"
        >
          Export HTML
        </button>
      </div>

      <button
        v-if="fileName"
        class="pdf-toolbar__button pdf-toolbar__button--clear"
        type="button"
        @click="$emit('clear-cache')"
      >
        Clear Cache
      </button>

      <input
        ref="fileInput"
        class="pdf-toolbar__file-input"
        type="file"
        accept="application/pdf,.pdf"
        @change="handleFileInputChange"
      >
    </div>
  </header>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  fileName: { type: String, default: '' },
  pageCount: { type: Number, default: 0 },
  workerLabel: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
  isTranslating: { type: Boolean, default: false },
  canTranslateVisiblePages: { type: Boolean, default: false },
  canExport: { type: Boolean, default: false },
  isPartialExport: { type: Boolean, default: false },
  isBlockTargetingActive: { type: Boolean, default: false },
  scannedPageCount: { type: Number, default: 0 },
  isOcrProcessing: { type: Boolean, default: false },
  restoredTranslationCount: { type: Number, default: 0 },
  viewerMode: { type: String, default: 'bilingual' },
  translationSummary: {
    type: Object,
    default: () => ({
      status: 'idle',
      translatedCount: 0,
      failedCount: 0,
      totalCount: 0
    })
  }
})

const emit = defineEmits(['file-selected', 'translate-visible', 'mode-change', 'cancel-translation', 'export-txt', 'export-markdown', 'export-html', 'toggle-block-targeting', 'request-ocr', 'clear-cache'])
const fileInput = ref(null)

const modeOptions = [
  { value: 'original', label: 'Original' },
  { value: 'bilingual', label: 'Bilingual' },
  { value: 'translated', label: 'Translated' },
  { value: 'translated-pdf', label: 'Translated PDF View' }
]

const translationStatusLabel = computed(() => {
  const { translatedCount, failedCount, totalCount, status } = props.translationSummary
  if (!totalCount) return ''

  if (status === 'error') {
    return 'Translation failed'
  }

  if (failedCount > 0) {
    return `Translated ${translatedCount}/${totalCount} blocks, ${failedCount} failed`
  }

  return `Translated ${translatedCount}/${totalCount} blocks`
})

function openFilePicker() {
  fileInput.value?.click()
}

function handleFileInputChange(event) {
  const [file] = event.target.files || []
  if (file) {
    emit('file-selected', file)
  }
  event.target.value = ''
}
</script>

<style scoped lang="scss">
.pdf-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding: 24px 28px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.pdf-toolbar__eyebrow,
.pdf-toolbar__subtitle {
  margin: 0;
  color: rgba(230, 237, 247, 0.72);
}

.pdf-toolbar__title-block h1 {
  margin: 4px 0 8px;
  font-size: 28px;
  line-height: 1.1;
}

.pdf-toolbar__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  color: rgba(230, 237, 247, 0.66);
  font-size: 13px;
}

.pdf-toolbar__partial-warning {
  color: #f4b860;
  font-weight: 600;
}

.pdf-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pdf-toolbar__button {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 10px 18px;
  background: #f4b860;
  color: #11161d;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.7;
    cursor: progress;
  }
}

.pdf-toolbar__file-input {
  display: none;
}

.pdf-toolbar__mode-group {
  display: flex;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.pdf-toolbar__mode-button {
  appearance: none;
  border: 0;
  padding: 8px 14px;
  background: transparent;
  color: rgba(230, 237, 247, 0.7);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #e6edf7;
  }

  &--active {
    background: rgba(90, 92, 255, 0.2);
    color: #e6edf7;
  }
}

.pdf-toolbar__button--cancel {
  background: rgba(239, 68, 68, 0.15);
  color: #fecaca;

  &:hover {
    background: rgba(239, 68, 68, 0.25);
  }
}

.pdf-toolbar__export-group {
  display: flex;
  gap: 8px;
}

.pdf-toolbar__button--export {
  background: rgba(255, 255, 255, 0.08);
  color: #e6edf7;
  font-size: 13px;
  padding: 8px 14px;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }
}

.pdf-toolbar__button--targeting {
  background: rgba(90, 92, 255, 0.12);
  color: #c4c6ff;

  &:hover {
    background: rgba(90, 92, 255, 0.2);
  }

  &--active {
    background: rgba(90, 92, 255, 0.3);
    color: #e6edf7;
  }
}

.pdf-toolbar__button--ocr {
  background: rgba(244, 184, 96, 0.12);
  color: #f4b860;

  &:hover {
    background: rgba(244, 184, 96, 0.2);
  }
}

.pdf-toolbar__ocr-status {
  color: rgba(230, 237, 247, 0.6);
  font-size: 13px;
  font-style: italic;
}

.pdf-toolbar__button--clear {
  background: rgba(239, 68, 68, 0.1);
  color: rgba(254, 202, 202, 0.8);
  font-size: 13px;
  padding: 8px 14px;

  &:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #fecaca;
  }
}

.pdf-toolbar__restore-status {
  color: rgba(34, 197, 94, 0.8);
  font-weight: 600;
}
</style>
