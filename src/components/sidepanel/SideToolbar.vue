<template>
  <div class="side-toolbar">
    <div class="toolbar-group">
      <!-- Select Element Button -->
      <button
        id="select-element-toggle-button"
        class="toolbar-button"
        :disabled="isSelectElementActivating || isReverting"
        :class="{ 
          'active': isSelecting,
          'loading': isSelectElementActivating 
        }"
        :title="getSelectElementTooltip()"
        @click="handleSelectElement"
      >
        <img
          src="@/assets/icons/select.png"
          alt="Select Element"
          class="toolbar-icon"
        >
      </button>

      <!-- Revert Action Button -->
      <button
        class="toolbar-button"
        :disabled="isReverting"
        :title="t('SIDEPANEL_REVERT_TOOLTIP', 'Revert Translation')"
        @click="handleRevert"
      >
        <img 
          src="@/assets/icons/revert.png" 
          alt="Revert" 
          class="toolbar-icon" 
        >
      </button>

      <!-- Clear Fields Button -->
      <button
        class="toolbar-button"
        :title="t('SIDEPANEL_CLEAR_STORAGE_TITLE_ICON', 'Clear Fields')"
        @click="handleClear"
      >
        <img
          src="@/assets/icons/clear.png"
          alt="Clear Fields"
          class="toolbar-icon"
        >
      </button>

      <div class="toolbar-separator" />

      <!-- API Provider Button -->
      <button
        class="toolbar-button"
        :title="t('SIDEPANEL_API_PROVIDER_TOOLTIP', 'API Provider')"
        @click="handleApiProvider"
      >
        <img
          :src="apiProviderIcon"
          alt="API Provider"
          class="toolbar-icon"
        >
      </button>

      <!-- History Button -->
      <button
        class="toolbar-button"
        :title="t('SIDEPANEL_HISTORY_TOOLTIP', 'Translation History')"
        @click="handleHistory"
      >
        <img
          src="@/assets/icons/history.svg"
          alt="History"
          class="toolbar-icon"
        >
      </button>
    </div>

    <div class="toolbar-group-bottom">
      <!-- Settings Button -->
      <button
        class="toolbar-button"
        :title="t('SIDEPANEL_SETTINGS_TITLE_ICON', 'Settings')"
        @click="handleSettings"
      >
        <img
          src="@/assets/icons/settings.png"
          alt="Settings"
          class="toolbar-icon"
        >
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import { useSidepanelActions } from '@/features/translation/composables/useTranslationModes.js'
import { useApiProvider } from '@/composables/shared/useApiProvider.js'
import { useBrowserAPI } from '@/composables/core/useBrowserAPI.js'
import { useI18n } from '@/composables/shared/useI18n.js'
// (helpers import removed: was empty / invalid)

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SideToolbar');

// Props
defineProps({
  // اختیاری: props برای کنترل state از خارج
})

// Emits
const emit = defineEmits([
  'select-element',
  'revert',
  'clear', 
  'api-provider',
  'history',
  'settings'
])

// Composables
const selectElement = useSelectElementTranslation()
const sidepanelActions = useSidepanelActions()
const apiProvider = useApiProvider()
const browserAPI = useBrowserAPI()
const { t } = useI18n()

// State
const isSelectElementActivating = computed(() => selectElement.isActivating.value)
const isSelecting = computed(() => selectElement.isSelectModeActive.value)
const isReverting = computed(() => sidepanelActions.isProcessing.value)

// API provider icon
const apiProviderIcon = computed(() => {
  const provider = apiProvider.currentProviderData.value
  if (provider && provider.icon) {
    return `@/assets/icons/api-providers/${provider.icon}`
  }
  return '@/assets/icons/api-providers/google.svg'
})

// Tooltip text for Select Element button
const getSelectElementTooltip = () => {
  if (isSelecting.value) {
    return t('SIDEPANEL_SELECT_ELEMENT_ACTIVE_TOOLTIP', 'Click to stop selecting elements')
  }
  return t('SIDEPANEL_SELECT_ELEMENT_TOOLTIP', 'Select Element')
}

// Event Handlers
const handleSelectElement = async () => {
  logger.debug('Select element button clicked')
  
  try {
    await selectElement.toggleSelectElement()
    emit('select-element')
  } catch (error) {
  logger.error('[SideToolbar] Failed to toggle select element mode:', error)
  }
}

const handleRevert = async () => {
  logger.debug('Revert button clicked')
  
  const success = await sidepanelActions.revertTranslation()
  if (success) {
    emit('revert')
  } else {
  logger.error('[SideToolbar] Failed to revert translation:', sidepanelActions.error.value)
  }
}

const handleClear = () => {
  logger.debug('Clear button clicked')
  emit('clear')
}

const handleApiProvider = () => {
  logger.debug('API provider button clicked')
  emit('api-provider')
}

const handleHistory = () => {
  logger.debug('History button clicked')
  emit('history')
}

const handleSettings = () => {
  logger.debug('Settings button clicked')
  
  // باز کردن صفحه تنظیمات
  browserAPI.safeSendMessage({ action: 'openOptionsPage' })
    .catch(error => {
      logger.error('[SideToolbar] Failed to open settings:', error)
    })
  
  emit('settings')
}

// Global click handler برای توقف TTS
const handleGlobalClick = () => {
  sidepanelActions.stopTTS()
}

// Event listener برای کلیک عمومی
if (typeof document !== 'undefined') {
  document.addEventListener('click', handleGlobalClick)
}

// Cleanup
import { onUnmounted } from 'vue'
// removed legacy createLogger import duplicates

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', handleGlobalClick)
  }
})
</script>

<style scoped>
.side-toolbar {
  width: 38px;
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-right: 1px solid var(--border-color);
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar-group-bottom {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar-button {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}

.toolbar-button:hover:not(:disabled) {
  background: var(--bg-hover);
}

.toolbar-button:active:not(:disabled) {
  background: var(--bg-active);
}

.toolbar-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-button.active {
  background: var(--accent-primary);
  color: var(--text-on-accent);
}

/* Removed nested active toolbar-icon - now handled by global sidepanel styles */

.toolbar-button.loading {
  position: relative;
  opacity: 0.8;
}

.toolbar-button.loading::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid var(--accent-primary);
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

@keyframes spin {
  0% { transform: translate(-50%, -50%) rotate(0deg); }
  100% { transform: translate(-50%, -50%) rotate(360deg); }
}

/* Removed duplicate .toolbar-icon - now handled by sidepanel.scss global styles */

.toolbar-separator {
  width: 20px;
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}
</style>