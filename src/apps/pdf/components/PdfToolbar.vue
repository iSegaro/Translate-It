<template>
  <header class="pdf-toolbar">
    <div class="pdf-toolbar__title-block">
      <div class="pdf-toolbar__file-row">
        <button
          v-if="hasOutline"
          class="pdf-toolbar__outline-toggle"
          :class="{ 'pdf-toolbar__outline-toggle--active': isOutlineVisible }"
          type="button"
          aria-label="Toggle outline"
          @click="$emit('toggle-outline')"
        >
          <svg
            class="pdf-toolbar__outline-icon"
            viewBox="0 0 16 16"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            aria-hidden="true"
          >
            <g fill="currentColor">
              <path d="M6.5 7.25a.75.75 0 01.75-.75h4a.75.75 0 010 1.5h-4a.75.75 0 01-.75-.75zM4.75 3.5a.75.75 0 000 1.5h.01a.75.75 0 000-1.5h-.01zM4 7.25a.75.75 0 01.75-.75h.01a.75.75 0 010 1.5h-.01A.75.75 0 014 7.25zM4.75 9.5a.75.75 0 000 1.5h.01a.75.75 0 000-1.5h-.01zM6.5 4.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75zM7.25 9.5a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z" />
              <path
                fill-rule="evenodd"
                d="M1 2.25A2.25 2.25 0 013.25 0h9.5A2.25 2.25 0 0115 2.25v11.5A2.25 2.25 0 0112.75 16h-9.5A2.25 2.25 0 011 13.75V2.25zm2.25-.75a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h9.5a.75.75 0 00.75-.75V2.25a.75.75 0 00-.75-.75h-9.5z"
                clip-rule="evenodd"
              />
            </g>
          </svg>
        </button>
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
      <template v-if="showTranslationOption">
        <div class="pdf-toolbar__mode-group pdf-toolbar__mode-group--content">
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

        <div class="pdf-toolbar__mode-group pdf-toolbar__mode-group--layout">
          <button
            class="pdf-toolbar__mode-button"
            :class="{ 'pdf-toolbar__mode-button--active': isSideBySide }"
            type="button"
            aria-label="Side by Side"
            :aria-pressed="isSideBySide"
            @click="handleLayoutModeToggle"
          >
            <svg
              class="pdf-toolbar__mode-icon"
              viewBox="0 0 32 32"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect
                x="15"
                y="4"
                width="2"
                height="24"
                fill="currentColor"
              />
              <path
                d="M10,7V25H4V7h6m0-2H4A2,2,0,0,0,2,7V25a2,2,0,0,0,2,2h6a2,2,0,0,0,2-2V7a2,2,0,0,0-2-2Z"
                fill="currentColor"
              />
              <path
                d="M28,7V25H22V7h6m0-2H22a2,2,0,0,0-2,2V25a2,2,0,0,0,2,2h6a2,2,0,0,0,2-2V7a2,2,0,0,0-2-2Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>

        <span
          class="pdf-toolbar__separator"
          aria-hidden="true"
        />
      </template>

      <div class="pdf-toolbar__page-group">
        <input
          class="pdf-toolbar__page-input"
          type="number"
          min="1"
          :value="currentPageDisplayValue"
          readonly
        >
        <span class="pdf-toolbar__page-separator">/</span>
        <span class="pdf-toolbar__page-total">{{ pageCount || 0 }}</span>
      </div>

      <span
        class="pdf-toolbar__separator"
        aria-hidden="true"
      />

      <div class="pdf-toolbar__zoom-group">
        <button
          class="pdf-toolbar__zoom-button pdf-toolbar__zoom-button--out"
          type="button"
          :disabled="!hasZoomOut"
          @click="$emit('zoom-step', -1)"
        >
          −
        </button>

        <select
          class="pdf-toolbar__zoom-select"
          :value="zoomSelectValue"
          @change="handleZoomSelectChange"
        >
          <option
            v-for="option in zoomPercentOptions"
            :key="option"
            :value="String(option)"
          >
            {{ option }}%
          </option>
        </select>

        <button
          class="pdf-toolbar__zoom-button pdf-toolbar__zoom-button--in"
          type="button"
          :disabled="!hasZoomIn"
          @click="$emit('zoom-step', 1)"
        >
          +
        </button>
      </div>

      <span
        class="pdf-toolbar__separator"
        aria-hidden="true"
      />

      <button
        class="pdf-toolbar__button pdf-toolbar__button--icon-trigger"
        type="button"
        :aria-label="fitToggleTooltip"
        :title="fitToggleTooltip"
        @click="handleFitToggle"
      >
        <img
          v-if="fitToggleIcon === 'fit-page'"
          :src="fitPageIcon"
          class="pdf-toolbar__button-icon"
          aria-hidden="true"
          alt=""
        >
        <img
          v-else
          :src="fitWidthIcon"
          class="pdf-toolbar__button-icon"
          aria-hidden="true"
          alt=""
        >
      </button>
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
          <svg
            class="pdf-toolbar__button-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            aria-hidden="true"
          >
            <path
              opacity="0.5"
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M3 14.25C3.41421 14.25 3.75 14.5858 3.75 15C3.75 16.4354 3.75159 17.4365 3.85315 18.1919C3.9518 18.9257 4.13225 19.3142 4.40901 19.591C4.68577 19.8678 5.07435 20.0482 5.80812 20.1469C6.56347 20.2484 7.56459 20.25 9 20.25H15C16.4354 20.25 17.4365 20.2484 18.1919 20.1469C18.9257 20.0482 19.3142 19.8678 19.591 19.591C19.8678 19.3142 20.0482 18.9257 20.1469 18.1919C20.2484 17.4365 20.25 16.4354 20.25 15C20.25 14.5858 20.5858 14.25 21 14.25C21.4142 14.25 21.75 14.5858 21.75 15V15.0549C21.75 16.4225 21.75 17.5248 21.6335 18.3918C21.5125 19.2919 21.2536 20.0497 20.6517 20.6516C20.0497 21.2536 19.2919 21.5125 18.3918 21.6335C17.5248 21.75 16.4225 21.75 15.0549 21.75H8.94513C7.57754 21.75 6.47522 21.75 5.60825 21.6335C4.70814 21.5125 3.95027 21.2536 3.34835 20.6517C2.74643 20.0497 2.48754 19.2919 2.36652 18.3918C2.24996 17.5248 2.24998 16.4225 2.25 15.0549C2.25 15.0366 2.25 15.0183 2.25 15C2.25 14.5858 2.58579 14.25 3 14.25Z"
              fill="currentColor"
            />
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M12 16.75C12.2106 16.75 12.4114 16.6615 12.5535 16.5061L16.5535 12.1311C16.833 11.8254 16.8118 11.351 16.5061 11.0715C16.2004 10.792 15.726 10.8132 15.4465 11.1189L12.75 14.0682V3C12.75 2.58579 12.4142 2.25 12 2.25C11.5858 2.25 11.25 2.58579 11.25 3V14.0682L8.55353 11.1189C8.27403 10.8132 7.79963 10.792 7.49393 11.0715C7.18823 11.351 7.16698 11.8254 7.44648 12.1311L11.4465 16.5061C11.5886 16.6615 11.7894 16.75 12 16.75Z"
              fill="currentColor"
            />
          </svg>
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
import fitPageIcon from '@/icons/ui/fit-page.svg'
import fitWidthIcon from '@/icons/ui/fit-width.svg'
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
  hasOutline: { type: Boolean, default: false },
  isOutlineVisible: { type: Boolean, default: false },
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

const emit = defineEmits(['file-selected', 'translate-visible', 'cancel-translation', 'content-view-change', 'layout-mode-change', 'toggle-outline', 'export-txt', 'export-markdown', 'export-html', 'request-ocr', 'clear-cache', 'zoom-step', 'zoom-change'])
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

const isSideBySide = computed(() => props.layoutMode === LAYOUT_MODE.SIDE_BY_SIDE)

const zoomSelectValue = computed(() => String(props.zoomPercent || 100))

const fitToggleIcon = computed(() => {
  if (props.zoomMode === 'fit-page') return 'fit-width'
  return 'fit-page'
})

const fitToggleTooltip = computed(() => {
  if (fitToggleIcon.value === 'fit-width') return 'Fit to width'
  return 'Fit to page'
})

const currentPageDisplayValue = computed(() => {
  const total = Number(props.pageCount) || 0
  const current = Number(props.currentPageNumber) || 0

  if (!total) {
    return '0'
  }

  return String(current || 1)
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
  const percent = Number(event.target.value)
  if (!Number.isFinite(percent)) return
  emit('zoom-change', { mode: 'percent', value: percent })
}

function handleFitToggle() {
  const mode = fitToggleIcon.value
  emit('zoom-change', { mode, value: mode === 'fit-width' ? 100 : (props.zoomPercent || 100) })
}

function handleLayoutModeToggle() {
  emit('layout-mode-change', isSideBySide.value ? LAYOUT_MODE.SINGLE : LAYOUT_MODE.SIDE_BY_SIDE)
}

function handleFileInputChange(event) {
  const [file] = event.target.files || []
  if (file) {
    emit('file-selected', file)
  }
  event.target.value = ''
}
</script>
