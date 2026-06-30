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
      class="pdf-toolbar__center-group"
    >
      <div class="pdf-toolbar__mode-group">
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

      <div class="pdf-toolbar__view-group">
        <span class="pdf-toolbar__page-indicator">
          {{ currentPageLabel }}
        </span>

        <div class="pdf-toolbar__zoom-group">
          <button
            class="pdf-toolbar__button pdf-toolbar__button--zoom"
            type="button"
            :disabled="!hasZoomOut"
            @click="$emit('zoom-step', -1)"
          >
            -
          </button>

          <select
            class="pdf-toolbar__zoom-select"
            :value="zoomSelectValue"
            @change="handleZoomSelectChange"
          >
            <option value="fit-width">
              Fit Width
            </option>
            <option value="fit-page">
              Fit Page
            </option>
            <option
              v-for="option in zoomPercentOptions"
              :key="option"
              :value="String(option)"
            >
              {{ option }}%
            </option>
          </select>

          <button
            class="pdf-toolbar__button pdf-toolbar__button--zoom"
            type="button"
            :disabled="!hasZoomIn"
            @click="$emit('zoom-step', 1)"
          >
            +
          </button>
        </div>
      </div>
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
import './PdfToolbar.scss'

const props = defineProps({
  fileName: { type: String, default: '' },
  pageCount: { type: Number, default: 0 },
  currentPageNumber: { type: Number, default: 0 },
  isLoading: { type: Boolean, default: false },
  isTranslating: { type: Boolean, default: false },
  canTranslateVisiblePages: { type: Boolean, default: false },
  canExport: { type: Boolean, default: false },
  isBlockTargetingActive: { type: Boolean, default: false },
  scannedPageCount: { type: Number, default: 0 },
  isOcrProcessing: { type: Boolean, default: false },
  viewerMode: { type: String, default: 'bilingual' },
  zoomMode: { type: String, default: 'fit-width' },
  zoomPercent: { type: Number, default: 100 },
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

const emit = defineEmits(['file-selected', 'translate-visible', 'mode-change', 'cancel-translation', 'export-txt', 'export-markdown', 'export-html', 'toggle-block-targeting', 'request-ocr', 'clear-cache', 'zoom-step', 'zoom-change'])
const fileInput = ref(null)
const zoomPercentOptions = [50, 75, 100, 125, 150, 200]

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

const zoomSelectValue = computed(() => {
  if (props.zoomMode === 'fit-width') return 'fit-width'
  if (props.zoomMode === 'fit-page') return 'fit-page'
  return String(props.zoomPercent || 100)
})

const currentPageLabel = computed(() => {
  const total = Number(props.pageCount) || 0
  const current = Number(props.currentPageNumber) || 0

  if (!total) {
    return '0 / 0'
  }

  return `${current || 1} / ${total}`
})

const hasZoomOut = computed(() => props.zoomMode !== 'fit-width' || props.zoomPercent > zoomPercentOptions[0])
const hasZoomIn = computed(() => props.zoomMode !== 'fit-width' || props.zoomPercent < zoomPercentOptions[zoomPercentOptions.length - 1])

function openFilePicker() {
  fileInput.value?.click()
}

function handleZoomSelectChange(event) {
  const value = event.target.value
  if (value === 'fit-width') {
    emit('zoom-change', { mode: 'fit-width', value: 100 })
    return
  }

  if (value === 'fit-page') {
    emit('zoom-change', { mode: 'fit-page', value: props.zoomPercent || 100 })
    return
  }

  const percent = Number(value)
  if (!Number.isFinite(percent)) return
  emit('zoom-change', { mode: 'percent', value: percent })
}

function handleFileInputChange(event) {
  const [file] = event.target.files || []
  if (file) {
    emit('file-selected', file)
  }
  event.target.value = ''
}
</script>

