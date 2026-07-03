<template>
  <header class="pdf-toolbar">
    <div class="pdf-toolbar__title-block">
      <div class="pdf-toolbar__file-row">
        <img
          class="pdf-toolbar__file-icon"
          src="@/icons/ui/page.png"
          alt=""
          aria-hidden="true"
        >
        <span
          class="pdf-toolbar__file-name"
          :title="fileName || 'PDF Viewer'"
        >
          {{ fileName || 'PDF Viewer' }}
        </span>
      </div>
    </div>

    <div
      v-if="fileName"
      class="pdf-toolbar__center-group"
    >
      <div class="pdf-toolbar__mode-group">
        <button
          v-for="opt in contentOptions"
          :key="opt.value"
          class="pdf-toolbar__mode-button"
          :class="{ 'pdf-toolbar__mode-button--active': contentView === opt.value }"
          type="button"
          @click="$emit('content-view-change', opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>

      <div class="pdf-toolbar__mode-group">
        <button
          v-for="opt in layoutOptions"
          :key="opt.value"
          class="pdf-toolbar__mode-button"
          :class="{ 'pdf-toolbar__mode-button--active': layoutMode === opt.value }"
          type="button"
          @click="$emit('layout-mode-change', opt.value)"
        >
          {{ opt.label }}
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
        ref="moreMenuRef"
        class="pdf-toolbar__export-dropdown"
      >
        <button
          ref="moreMenuTriggerRef"
          class="pdf-toolbar__button pdf-toolbar__button--menu-trigger pdf-toolbar__button--icon-trigger"
          type="button"
          aria-label="More actions"
          aria-haspopup="menu"
          :aria-expanded="activeMenu === 'more'"
          @click="toggleMenu('more')"
        >
          <span
            class="pdf-toolbar__menu-trigger-icon"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </span>
        </button>

        <div
          v-if="activeMenu === 'more'"
          class="pdf-toolbar__export-menu"
          role="menu"
        >
          <button
            class="pdf-toolbar__export-item"
            type="button"
            role="menuitem"
            :disabled="isLoading"
            @click="handleOpenPdfAction"
          >
            {{ isLoading ? 'Loading...' : 'Open PDF' }}
          </button>
          <button
            v-if="fileName"
            class="pdf-toolbar__export-item"
            type="button"
            role="menuitem"
            @click="handleClearCacheAction"
          >
            Clear Cache
          </button>
        </div>
      </div>

      <div
        v-if="fileName && canExport"
        ref="exportMenuRef"
        class="pdf-toolbar__export-dropdown"
      >
        <button
          ref="exportMenuTriggerRef"
          class="pdf-toolbar__button pdf-toolbar__button--menu-trigger pdf-toolbar__button--icon-trigger"
          type="button"
          aria-label="Export options"
          aria-haspopup="menu"
          :aria-expanded="activeMenu === 'export'"
          @click="toggleMenu('export')"
        >
          <img
            class="pdf-toolbar__button-icon"
            src="@/icons/ui/download.svg"
            alt=""
            aria-hidden="true"
          >
        </button>

        <div
          v-if="activeMenu === 'export'"
          class="pdf-toolbar__export-menu"
          role="menu"
        >
          <button
            class="pdf-toolbar__export-item"
            type="button"
            role="menuitem"
            @click="handleExportAction('export-txt')"
          >
            Export TXT
          </button>
          <button
            class="pdf-toolbar__export-item"
            type="button"
            role="menuitem"
            @click="handleExportAction('export-markdown')"
          >
            Export Markdown
          </button>
          <button
            class="pdf-toolbar__export-item"
            type="button"
            role="menuitem"
            @click="handleExportAction('export-html')"
          >
            Export HTML
          </button>
        </div>
      </div>

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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CONTENT_VIEW, LAYOUT_MODE } from '../composables/usePdfViewerMode.js'
import './PdfToolbar.scss'

const props = defineProps({
  fileName: { type: String, default: '' },
  pageCount: { type: Number, default: 0 },
  currentPageNumber: { type: Number, default: 0 },
  isLoading: { type: Boolean, default: false },
  isTranslating: { type: Boolean, default: false },
  canTranslateVisiblePages: { type: Boolean, default: false },
  canExport: { type: Boolean, default: false },
  scannedPageCount: { type: Number, default: 0 },
  isOcrProcessing: { type: Boolean, default: false },
  contentView: { type: String, default: CONTENT_VIEW.ORIGINAL },
  layoutMode: { type: String, default: LAYOUT_MODE.SINGLE },
  zoomMode: { type: String, default: 'fit-width' },
  zoomPercent: { type: Number, default: 100 },
  showTranslationOption: { type: Boolean, default: false },
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

const emit = defineEmits(['file-selected', 'translate-visible', 'cancel-translation', 'content-view-change', 'layout-mode-change', 'export-txt', 'export-markdown', 'export-html', 'request-ocr', 'clear-cache', 'zoom-step', 'zoom-change'])
const fileInput = ref(null)
const exportMenuRef = ref(null)
const exportMenuTriggerRef = ref(null)
const moreMenuRef = ref(null)
const moreMenuTriggerRef = ref(null)
const activeMenu = ref(null)
const zoomPercentOptions = [50, 75, 100, 125, 150, 200]

const allContentOptions = [
  { value: CONTENT_VIEW.ORIGINAL, label: 'Original' },
  { value: CONTENT_VIEW.TRANSLATION, label: 'Translation' },
  { value: CONTENT_VIEW.TRANSLATED_PDF, label: 'Translated PDF' }
]

const contentOptions = computed(() => {
  if (props.showTranslationOption) return allContentOptions
  return allContentOptions.filter(opt => opt.value !== CONTENT_VIEW.TRANSLATION)
})

const layoutOptions = [
  { value: LAYOUT_MODE.SINGLE, label: 'Single' },
  { value: LAYOUT_MODE.SIDE_BY_SIDE, label: 'Side by Side' }
]

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

function toggleMenu(menuName) {
  activeMenu.value = activeMenu.value === menuName ? null : menuName
}

function closeMenus() {
  activeMenu.value = null
}

function handleExportAction(eventName) {
  emit(eventName)
  closeMenus()
}

function handleOpenPdfAction() {
  openFilePicker()
  closeMenus()
}

function handleClearCacheAction() {
  emit('clear-cache')
  closeMenus()
}

function getActiveMenuRefs() {
  if (activeMenu.value === 'export') {
    return {
      menuRef: exportMenuRef.value,
      triggerRef: exportMenuTriggerRef.value
    }
  }

  if (activeMenu.value === 'more') {
    return {
      menuRef: moreMenuRef.value,
      triggerRef: moreMenuTriggerRef.value
    }
  }

  return {
    menuRef: null,
    triggerRef: null
  }
}

function handleDocumentPointerDown(event) {
  if (!activeMenu.value) return

  const { menuRef, triggerRef } = getActiveMenuRefs()
  if (menuRef?.contains(event.target) || triggerRef?.contains(event.target)) return
  closeMenus()
}

function handleDocumentKeyDown(event) {
  if (!activeMenu.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    const activeMenuName = activeMenu.value
    closeMenus()
    if (activeMenuName === 'export') {
      exportMenuTriggerRef.value?.focus?.()
    } else if (activeMenuName === 'more') {
      moreMenuTriggerRef.value?.focus?.()
    }
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  document.addEventListener('keydown', handleDocumentKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  document.removeEventListener('keydown', handleDocumentKeyDown)
})

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
