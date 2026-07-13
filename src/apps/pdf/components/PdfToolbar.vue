<template>
  <header class="pdf-toolbar">
    <div class="pdf-toolbar__title-block">
      <div class="pdf-toolbar__file-row">
        <button
          v-if="hasOutline"
          class="pdf-toolbar__outline-toggle"
          :class="{ 'pdf-toolbar__outline-toggle--active': isOutlineVisible }"
          type="button"
          :aria-label="TOOLTIP_OUTLINE"
          :title="TOOLTIP_OUTLINE"
          @click="$emit('toggle-outline')"
        >
          <SvgIcon :src="outlineIcon" :size="16" />
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
            :aria-label="TOOLTIP_SIDE_BY_SIDE"
            :title="TOOLTIP_SIDE_BY_SIDE"
            :aria-pressed="isSideBySide"
            @click="handleLayoutModeToggle"
          >
            <SvgIcon :src="splitScreenIcon" :size="14" />
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
          :aria-label="TOOLTIP_ZOOM_OUT"
          :title="TOOLTIP_ZOOM_OUT"
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
          :aria-label="TOOLTIP_ZOOM_IN"
          :title="TOOLTIP_ZOOM_IN"
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
        <SvgIcon v-if="fitToggleIcon === 'fit-page'" :src="fitPageIcon" :size="18" />
        <SvgIcon v-else :src="fitWidthIcon" :size="18" />
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

      <ProviderSelector
        :model-value="pdfProviderValue"
        mode="split"
        :is-global="false"
        allow-default
        only-configured
        :loading="isTranslating"
        :disabled="!canTranslateVisiblePages && !isTranslating"
        :dropdown-disabled="isTranslating"
        @provider-change="handleProviderChange"
        @translate="handleTranslateRequest"
        @cancel="$emit('cancel-translation')"
      />
      <div
        v-if="fileName && canExport"
        ref="exportMenuRef"
        class="pdf-toolbar__export-dropdown"
      >
        <button
          ref="exportMenuTriggerRef"
          class="pdf-toolbar__button pdf-toolbar__button--menu-trigger pdf-toolbar__button--icon-trigger"
          type="button"
          :aria-label="TOOLTIP_EXPORT"
          :title="TOOLTIP_EXPORT"
          aria-haspopup="menu"
          :aria-expanded="activeMenu === 'export'"
          @click="toggleMenu('export')"
        >
          <SvgIcon :src="downloadIcon" :size="18" />
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
          :aria-label="TOOLTIP_MORE"
          :title="TOOLTIP_MORE"
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
import { TranslationMode } from '@/shared/config/config.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import SvgIcon from '@/components/shared/SvgIcon.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import outlineIcon from '@/icons/ui/outline.svg?url'
import splitScreenIcon from '@/icons/ui/split-screen.svg?url'
import fitPageIcon from '@/icons/ui/fit-page.svg?url'
import fitWidthIcon from '@/icons/ui/fit-width.svg?url'
import downloadIcon from '@/icons/ui/download.svg?url'
import './PdfToolbar.scss'

const TOOLTIP_OUTLINE = 'Toggle outline'
const TOOLTIP_SIDE_BY_SIDE = 'Side by Side'
const TOOLTIP_ZOOM_OUT = 'Zoom out'
const TOOLTIP_ZOOM_IN = 'Zoom in'
const TOOLTIP_EXPORT = 'Export options'
const TOOLTIP_MORE = 'More actions'

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
})

const emit = defineEmits(['file-selected', 'translate-visible', 'cancel-translation', 'content-view-change', 'layout-mode-change', 'toggle-outline', 'export-txt', 'export-markdown', 'export-html', 'request-ocr', 'clear-cache', 'zoom-step', 'zoom-change'])

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfToolbar')
const settingsStore = useSettingsStore()

const pdfProviderValue = computed(() => {
  return settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.PDF] || 'default'
})

const providerPersistenceState = {
  sequence: 0,
  latest: null,
  running: null
}

const persistPdfProvider = async (providerId) => {
  const modeProviders = {
    ...(settingsStore.settings?.MODE_PROVIDERS || {}),
    [TranslationMode.PDF]: providerId === 'default' ? null : providerId
  }
  await settingsStore.updateSettingAndPersist('MODE_PROVIDERS', modeProviders)
}

const handleProviderChange = (providerId) => {
  providerPersistenceState.latest = {
    sequence: ++providerPersistenceState.sequence,
    providerId
  }

  if (!providerPersistenceState.running) {
    providerPersistenceState.running = runProviderPersistenceQueue()
  }
}

const runProviderPersistenceQueue = async () => {
  try {
    while (providerPersistenceState.latest) {
      const ownership = providerPersistenceState.latest
      providerPersistenceState.latest = null

      try {
        await persistPdfProvider(ownership.providerId)
      } catch (error) {
        if (ownership.sequence === providerPersistenceState.sequence && !providerPersistenceState.latest) {
          logger.error('Failed to persist PDF provider selection:', error)
          return
        }

        continue
      }

      if (ownership.sequence === providerPersistenceState.sequence && !providerPersistenceState.latest) {
        emit('translate-visible')
        return
      }
    }
  } finally {
    providerPersistenceState.running = null

    if (providerPersistenceState.latest) {
      providerPersistenceState.running = runProviderPersistenceQueue()
    }
  }
}

const handleTranslateRequest = () => {
  if (providerPersistenceState.running) return
  emit('translate-visible')
}

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
