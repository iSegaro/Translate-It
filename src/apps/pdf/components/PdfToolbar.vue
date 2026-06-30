<template>
  <header class="pdf-toolbar">
    <div class="pdf-toolbar__title-block">
      <span
        class="pdf-toolbar__file-name"
        :title="fileName || 'PDF Viewer'"
      >
        {{ fileName || 'PDF Viewer' }}
      </span>

      <span
        v-if="translationSummary.totalCount > 0"
        class="pdf-toolbar__progress"
      >
        {{ translationStatusLabel }}
      </span>
    </div>

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

    <div class="pdf-toolbar__actions">
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
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 12px 18px;
  align-items: center;
  padding: 10px 20px;
  min-height: 48px;
  box-sizing: border-box;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 16, 22, 0.94);
  backdrop-filter: blur(14px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
}

.pdf-toolbar__title-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-self: start;
}

.pdf-toolbar__file-name {
  display: block;
  max-width: min(36vw, 440px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e6edf7;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.pdf-toolbar__progress {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(230, 237, 247, 0.66);
  font-size: 13px;
}

.pdf-toolbar__mode-group {
  display: flex;
  gap: 12px;
  justify-self: center;
  min-width: 0;
}

.pdf-toolbar__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  justify-self: end;
}

.pdf-toolbar__button {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.08);
  color: #e6edf7;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  &:disabled {
    opacity: 0.7;
    cursor: progress;
  }
}

.pdf-toolbar__file-input {
  display: none;
}

.pdf-toolbar__mode-group {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.pdf-toolbar__mode-button {
  appearance: none;
  border: 0;
  padding: 7px 12px;
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
  padding: 8px 12px;

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
  padding: 8px 12px;

  &:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #fecaca;
  }
}

.pdf-toolbar__restore-status {
  color: rgba(34, 197, 94, 0.8);
  font-weight: 600;
}

@media (max-width: 1100px) {
  .pdf-toolbar {
    grid-template-columns: minmax(0, 1fr);
    justify-items: stretch;
  }

  .pdf-toolbar__title-block,
  .pdf-toolbar__mode-group,
  .pdf-toolbar__actions {
    justify-self: stretch;
  }

  .pdf-toolbar__mode-group {
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .pdf-toolbar__actions {
    justify-content: flex-start;
  }
}
</style>
