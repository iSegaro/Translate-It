<template>
  <ToolbarMenu
    ref="moreMenuRef"
    class="pdf-toolbar__more-menu"
    variant="dark"
    @open="closeMenus"
  >
    <template #trigger="{ triggerAttrs, triggerRef, onToggle }">
      <button
        v-bind="triggerAttrs"
        :ref="triggerRef"
        class="pdf-toolbar__button pdf-toolbar__button--menu-trigger pdf-toolbar__button--icon-trigger"
        type="button"
        :aria-label="TOOLTIP_MORE"
        :title="TOOLTIP_MORE"
        @click="onToggle"
        @keydown.enter.prevent="onToggle"
        @keydown.space.prevent="onToggle"
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
    </template>

    <template #default="{ close }">
      <div class="pdf-toolbar__export-menu">
        <button
          class="pdf-toolbar__export-item pdf-toolbar__menu-row"
          type="button"
          @click="close(); handleOpenLanguageSettings()"
        >
          <span class="pdf-toolbar__menu-row-label">Language: {{ languageSummarySource }} → {{ languageSummaryTarget }}</span>
        </button>
        <button
          class="pdf-toolbar__export-item pdf-toolbar__menu-row"
          type="button"
          :disabled="isLoading"
          @click="close(); handleOpenPdfAction()"
        >
          <span class="pdf-toolbar__menu-row-label">{{ isLoading ? 'Loading...' : 'Open PDF' }}</span>
        </button>
        <button
          class="pdf-toolbar__export-item pdf-toolbar__menu-row"
          type="button"
          :disabled="!fileName"
          @click="close(); handleRequestPdfInfo()"
        >
          <span class="pdf-toolbar__menu-row-label">PDF Information</span>
        </button>
        <div
          v-if="canExport"
          class="pdf-toolbar__menu-section pdf-toolbar__menu-section--has-flyout"
          role="group"
          aria-label="Export"
        >
          <button
            ref="exportTriggerRef"
            class="pdf-toolbar__export-item pdf-toolbar__export-item--submenu-trigger pdf-toolbar__menu-row"
            type="button"
            :aria-haspopup="true"
            :aria-expanded="isExportSubmenuOpen"
            @click="isExportSubmenuOpen = !isExportSubmenuOpen"
          >
            <span class="pdf-toolbar__menu-row-label">Export</span>
            <span class="pdf-toolbar__submenu-chevron" />
          </button>
          <Transition name="pdf-toolbar-flyout">
            <div
              v-if="isExportSubmenuOpen"
              ref="exportFlyoutRef"
              class="pdf-toolbar__flyout"
              role="menu"
              :style="flyoutStyle"
            >
              <button
                class="pdf-toolbar__flyout-item pdf-toolbar__menu-row"
                type="button"
                role="menuitem"
                @click="close(); handleExportAction('export-txt')"
              >
                <span class="pdf-toolbar__menu-row-label">Export TXT</span>
              </button>
              <button
                class="pdf-toolbar__flyout-item pdf-toolbar__menu-row"
                type="button"
                role="menuitem"
                @click="close(); handleExportAction('export-markdown')"
              >
                <span class="pdf-toolbar__menu-row-label">Export Markdown</span>
              </button>
              <button
                class="pdf-toolbar__flyout-item pdf-toolbar__menu-row"
                type="button"
                role="menuitem"
                @click="close(); handleExportAction('export-html')"
              >
                <span class="pdf-toolbar__menu-row-label">Export HTML</span>
              </button>
            </div>
          </Transition>
        </div>
        <button
          class="pdf-toolbar__export-item pdf-toolbar__menu-row"
          type="button"
          @click="close(); handleOpenSettingsAction()"
        >
          <span class="pdf-toolbar__menu-row-label">Settings</span>
        </button>
        <div
          v-if="isDebugMode"
          class="pdf-toolbar__menu-section"
          role="group"
          aria-label="Developer"
        >
          <span class="pdf-toolbar__menu-section-title">Developer</span>
          <button
            class="pdf-toolbar__export-item pdf-toolbar__menu-row"
            type="button"
            :disabled="isRegionComparisonActive"
            @click="close(); handleRequestRegionComparisonAction()"
          >
            <span class="pdf-toolbar__menu-row-label">Region Comparison</span>
          </button>
          <button
            v-if="canExportRegionComparisonArtifact"
            class="pdf-toolbar__export-item pdf-toolbar__menu-row"
            type="button"
            @click="close(); handleExportRegionComparisonArtifactAction()"
          >
            <span class="pdf-toolbar__menu-row-label">Export Region Comparison Artifact</span>
          </button>
          <button
            v-if="fileName"
            class="pdf-toolbar__export-item pdf-toolbar__menu-row"
            type="button"
            @click="close(); handleClearCacheAction()"
          >
            <span class="pdf-toolbar__menu-row-label">Clear Cache</span>
          </button>
        </div>
      </div>
    </template>
  </ToolbarMenu>
</template>

<script setup>
import { computed, ref } from 'vue'
import ToolbarMenu from '@/components/base/ToolbarMenu/ToolbarMenu.vue'
import './PdfMoreMenu.scss'

const TOOLTIP_MORE = 'More actions'

const props = defineProps({
  fileName: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
  canExport: { type: Boolean, default: false },
  sourceLanguage: { type: String, default: 'auto' },
  targetLanguage: { type: String, default: 'fa' },
  isDebugMode: { type: Boolean, default: false },
  regionComparisonState: { type: Object, default: null },
  canExportRegionComparisonArtifact: { type: Boolean, default: false }
})

const emit = defineEmits([
  'request-open-pdf',
  'export-txt',
  'export-markdown',
  'export-html',
  'request-region-comparison',
  'export-region-comparison-artifact',
  'clear-cache',
  'open-settings',
  'request-document-info',
  'open-language-settings'
])

const moreMenuRef = ref(null)
const isExportSubmenuOpen = ref(false)
const exportTriggerRef = ref(null)
const exportFlyoutRef = ref(null)

const isRegionComparisonActive = computed(() => ['running', 'cancelling'].includes(props.regionComparisonState?.status))

const languageSummarySource = computed(() =>
  props.sourceLanguage === 'auto' ? 'Auto' : props.sourceLanguage.toUpperCase()
)

const languageSummaryTarget = computed(() => props.targetLanguage.toUpperCase())

const flyoutStyle = computed(() => {
  if (!exportTriggerRef.value) return {}
  const rect = exportTriggerRef.value.getBoundingClientRect()
  return {
    position: 'fixed',
    top: `${rect.top}px`,
    right: `${window.innerWidth - rect.left + 4}px`,
    left: 'auto'
  }
})

function closeMenus() {
  isExportSubmenuOpen.value = false
}

function handleOpenLanguageSettings() {
  closeMenus()
  emit('open-language-settings')
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

function handleOpenSettingsAction() {
  emit('open-settings')
  closeMenus()
}

function handleRequestPdfInfo() {
  if (!props.fileName) return
  closeMenus()
  emit('request-document-info')
}

function handleRequestRegionComparisonAction() {
  emit('request-region-comparison')
  closeMenus()
}

function handleExportRegionComparisonArtifactAction() {
  emit('export-region-comparison-artifact')
  closeMenus()
}

defineExpose({ moreMenuRef })
</script>
