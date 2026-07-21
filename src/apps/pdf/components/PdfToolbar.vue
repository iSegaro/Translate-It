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
          <SvgIcon
            :src="outlineIcon"
            :size="16"
          />
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
            <SvgIcon
              :src="splitScreenIcon"
              :size="14"
            />
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
        <SvgIcon
          v-if="fitToggleIcon === 'fit-page'"
          :src="fitPageIcon"
          :size="18"
        />
        <SvgIcon
          v-else
          :src="fitWidthIcon"
          :size="18"
        />
      </button>
    </div>

    <div class="pdf-toolbar__actions">
      <select
        v-if="hasExecutionModeChoice"
        class="pdf-toolbar__execution-mode-select"
        :value="executionMode"
        aria-label="Region execution mode"
        @change="handleExecutionModeChange"
      >
        <option
          v-for="mode in executionModes"
          :key="mode"
          :value="mode"
        >
          {{ mode }}
        </option>
      </select>

      <div
        v-if="ocrViewModel"
        ref="ocrSplitRef"
        class="pdf-toolbar__ocr-split"
      >
        <div class="pdf-toolbar__ocr-buttons">
          <button
            class="pdf-toolbar__ocr-primary"
            :class="{
              'pdf-toolbar__ocr-primary--cancel': ocrViewModel.canCancel,
              'pdf-toolbar__ocr-primary--highlight': ocrViewModel.currentPageContainsOcr && !ocrViewModel.canCancel
            }"
            :disabled="ocrViewModel.disabled"
            type="button"
            :aria-label="primaryAriaLabel"
            @click="$emit('primary-click')"
          >
            {{ primaryLabel }}
          </button>
          <button
            ref="ocrMenuTriggerRef"
            class="pdf-toolbar__ocr-arrow"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="activeMenu === 'ocr'"
            :aria-label="'More OCR options'"
            @click="toggleOcrMenu"
            @keydown="handleOcrArrowKeydown"
          >
            ▼
          </button>
        </div>

        <div
          v-if="activeMenu === 'ocr'"
          ref="ocrMenuRef"
          class="pdf-toolbar__ocr-menu"
          role="menu"
        >
          <template v-if="ocrMenuView === 'main'">
            <button
              class="pdf-toolbar__ocr-menu-item"
              :class="{
                'pdf-toolbar__ocr-menu-item--selected': ocrViewModel.preferredAction === 'region',
                'pdf-toolbar__ocr-menu-item--disabled': ocrViewModel.canCancel
              }"
              role="menuitemradio"
              :aria-checked="ocrViewModel.preferredAction === 'region'"
              :disabled="ocrViewModel.canCancel"
              @click="selectAction('region')"
            >
              <span class="pdf-toolbar__ocr-menu-check" aria-hidden="true">✓</span>
              OCR Region
            </button>
            <button
              class="pdf-toolbar__ocr-menu-item"
              :class="{
                'pdf-toolbar__ocr-menu-item--selected': ocrViewModel.preferredAction === 'page',
                'pdf-toolbar__ocr-menu-item--disabled': !ocrViewModel.pageOcrAvailable || ocrViewModel.canCancel
              }"
              role="menuitemradio"
              :aria-checked="ocrViewModel.preferredAction === 'page'"
              :disabled="!ocrViewModel.pageOcrAvailable || ocrViewModel.canCancel"
              :title="!ocrViewModel.pageOcrAvailable && !ocrViewModel.canCancel ? 'Not available for current page' : ''"
              @click="selectAction('page')"
            >
              <span class="pdf-toolbar__ocr-menu-check" aria-hidden="true">✓</span>
              OCR Page
            </button>

            <div class="pdf-toolbar__ocr-menu-divider" role="separator" />

            <button
              class="pdf-toolbar__ocr-menu-item"
              role="menuitem"
              @click="ocrMenuView = 'language'"
            >
              Language ▶
            </button>

            <div class="pdf-toolbar__ocr-menu-divider" role="separator" />

            <button
              class="pdf-toolbar__ocr-menu-item"
              role="menuitem"
              @click="handleManageLanguages"
            >
              ⚙ Manage Languages...
            </button>
          </template>

          <template v-if="ocrMenuView === 'language'">
            <button
              class="pdf-toolbar__ocr-menu-item pdf-toolbar__ocr-menu-item--back"
              role="menuitem"
              @click="ocrMenuView = 'main'"
            >
              ← Back
            </button>

            <div class="pdf-toolbar__ocr-menu-scroll">
              <template v-if="ocrViewModel.installedLanguages.length">
                <button
                  v-for="lang in ocrViewModel.installedLanguages"
                  :key="lang.code"
                  class="pdf-toolbar__ocr-menu-item"
                  :class="{ 'pdf-toolbar__ocr-menu-item--selected': lang.selected }"
                  role="menuitemradio"
                  :aria-checked="lang.selected"
                  @click="selectLanguage(lang.code)"
                >
                  <span class="pdf-toolbar__ocr-menu-check" aria-hidden="true">✓</span>
                  {{ lang.name }}
                </button>
              </template>
              <div
                v-else
                class="pdf-toolbar__ocr-menu-empty"
              >
                No languages installed
              </div>
            </div>

            <div class="pdf-toolbar__ocr-menu-divider" role="separator" />

            <button
              class="pdf-toolbar__ocr-menu-item"
              role="menuitem"
              @click="handleManageLanguages"
            >
              ⚙ Manage Languages...
            </button>
          </template>
        </div>
      </div>

      <ProviderSelector
        :model-value="pdfProviderValue"
        mode="split"
        :is-global="false"
        allow-default
        only-configured
        required-feature="bulk"
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
          <SvgIcon
            :src="downloadIcon"
            :size="18"
          />
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
          <div
            v-if="isDebugMode"
            class="pdf-toolbar__menu-section"
            role="group"
            aria-label="Developer"
          >
            <span class="pdf-toolbar__menu-section-title">Developer</span>
            <button
              class="pdf-toolbar__export-item"
              type="button"
              role="menuitem"
              :disabled="isRegionComparisonActive"
              @click="handleRequestRegionComparisonAction"
            >
              Region Comparison
            </button>
            <button
              v-if="canExportRegionComparisonArtifact"
              class="pdf-toolbar__export-item"
              type="button"
              role="menuitem"
              @click="handleExportRegionComparisonArtifactAction"
            >
              Export Region Comparison Artifact
            </button>
            <div
              v-if="isRegionComparisonActive"
              class="pdf-toolbar__regionComparison"
              aria-live="polite"
            >
              <div class="pdf-toolbar__regionComparison-summary">
                <span>RegionComparison {{ regionComparisonState.status }}</span>
                <span v-if="regionComparisonState.progress">
                  {{ regionComparisonState.progress.completedCandidates }}/{{ regionComparisonState.progress.totalCandidates }}
                </span>
                <button
                  v-if="isRegionComparisonActive"
                  class="pdf-toolbar__regionComparison-cancel"
                  type="button"
                  @click="$emit('cancel-region-comparison')"
                >
                  Cancel
                </button>
              </div>
              <span
                v-if="regionComparisonState.progress?.currentCandidate"
                class="pdf-toolbar__regionComparison-current"
              >
                {{ regionComparisonState.progress.currentCandidate.candidateId }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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
  ocrViewModel: { type: Object, default: null },
  contentView: { type: String, default: CONTENT_VIEW.ORIGINAL },
  layoutMode: { type: String, default: LAYOUT_MODE.SINGLE },
  zoomMode: { type: String, default: 'fit-width' },
  zoomPercent: { type: Number, default: 100 },
  showTranslationOption: { type: Boolean, default: false },
  hasOutline: { type: Boolean, default: false },
  isOutlineVisible: { type: Boolean, default: false },
  executionMode: { type: String, default: '' },
  executionModes: { type: Array, default: () => [] },
  regionComparisonState: { type: Object, default: null },
  canExportRegionComparisonArtifact: { type: Boolean, default: false },
})

const emit = defineEmits(['request-open-pdf', 'translate-visible', 'cancel-translation', 'content-view-change', 'layout-mode-change', 'toggle-outline', 'export-txt', 'export-markdown', 'export-html', 'request-region-comparison', 'cancel-region-comparison', 'export-region-comparison-artifact', 'clear-cache', 'zoom-step', 'zoom-change', 'execution-mode-change', 'primary-click', 'select-action', 'select-language', 'manage-languages'])

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfToolbar')
const settingsStore = useSettingsStore()

const pdfProviderValue = computed(() => {
  return settingsStore.settings?.MODE_PROVIDERS?.[TranslationMode.PDF] || 'default'
})
const isDebugMode = computed(() => settingsStore.settings?.DEBUG_MODE === true)
const isRegionComparisonActive = computed(() => ['running', 'cancelling'].includes(props.regionComparisonState?.status))

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

const ocrModel = computed(() => props.ocrViewModel || {})

const primaryLabel = computed(() => {
  const m = ocrModel.value
  const lang = m.language?.compactLabel || (m.language?.code || 'EN').toUpperCase()
  if (m.canCancel) return `Cancel · ${lang}`
  const action = m.primaryAction === 'page' ? 'OCR Page' : 'OCR Region'
  return `${action} · ${lang}`
})

const primaryAriaLabel = computed(() => {
  const m = ocrModel.value
  if (m.canCancel) return `Cancel OCR. ${m.language?.name || 'EN'}`
  const action = m.primaryAction === 'page' ? 'OCR Page' : 'OCR Region'
  let label = `${action}. ${m.language?.name || 'EN'}`
  if (m.currentPageContainsOcr && !m.canCancel) label += '. Current page has OCR data.'
  return label
})

function toggleOcrMenu() {
  if (activeMenu.value === 'ocr') {
    closeMenus()
    return
  }
  closeMenus()
  activeMenu.value = 'ocr'
  ocrMenuView.value = 'main'
}

function handleOcrArrowKeydown(event) {
  if (event.key === 'ArrowDown' && activeMenu.value !== 'ocr') {
    event.preventDefault()
    toggleOcrMenu()
    nextTick(() => {
      const items = Array.from(ocrMenuRef.value?.querySelectorAll('[role="menuitem"], [role="menuitemradio"]') || [])
      const first = items.find(el => !el.disabled)
      first?.focus()
    })
  }
}

function selectAction(action) {
  if (ocrModel.value.canCancel) return
  if (action === 'page' && !ocrModel.value.pageOcrAvailable) return
  emit('select-action', action)
  closeMenus()
}

function selectLanguage(code) {
  emit('select-language', code)
  closeMenus()
}

function handleManageLanguages() {
  emit('manage-languages')
  closeMenus()
}

const exportMenuRef = ref(null)
const exportMenuTriggerRef = ref(null)
const moreMenuRef = ref(null)
const moreMenuTriggerRef = ref(null)
const ocrSplitRef = ref(null)
const ocrMenuRef = ref(null)
const ocrMenuTriggerRef = ref(null)
const ocrMenuView = ref('main')
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
const hasExecutionModeChoice = computed(() => props.executionModes.length > 1)

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
  emit('request-open-pdf')
  closeMenus()
}

function handleClearCacheAction() {
  emit('clear-cache')
  closeMenus()
}

function handleRequestRegionComparisonAction() {
  emit('request-region-comparison')
  closeMenus()
}

function handleExportRegionComparisonArtifactAction() {
  emit('export-region-comparison-artifact')
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

  if (activeMenu.value === 'ocr') {
    return {
      menuRef: ocrMenuRef.value,
      triggerRef: ocrMenuTriggerRef.value
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
  if (activeMenu.value === 'ocr') {
    const inside = ocrSplitRef.value?.contains(event.target) || menuRef?.contains(event.target)
    if (inside) return
    closeMenus()
    return
  }
  if (menuRef?.contains(event.target) || triggerRef?.contains(event.target)) return
  closeMenus()
}

function handleDocumentKeyDown(event) {
  if (!activeMenu.value) return

  if (activeMenu.value === 'ocr' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    const items = Array.from(ocrMenuRef.value?.querySelectorAll('[role="menuitem"], [role="menuitemradio"]') || [])
    const enabled = items.filter(el => !el.disabled)
    if (!enabled.length) return
    const currentIndex = enabled.indexOf(document.activeElement)
    let nextIndex
    if (event.key === 'ArrowDown') {
      nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % enabled.length
    } else {
      nextIndex = currentIndex === -1 ? enabled.length - 1 : (currentIndex - 1 + enabled.length) % enabled.length
    }
    enabled[nextIndex]?.focus()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    const activeMenuName = activeMenu.value
    if (activeMenuName === 'ocr') {
      if (ocrMenuView.value === 'language') {
        ocrMenuView.value = 'main'
        nextTick(() => {
          ocrMenuRef.value?.querySelector('.pdf-toolbar__ocr-menu-item--back')?.focus()
        })
        return
      }
      closeMenus()
      ocrMenuTriggerRef.value?.focus?.()
      return
    }
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

function handleExecutionModeChange(event) {
  emit('execution-mode-change', event.target.value)
}

</script>
