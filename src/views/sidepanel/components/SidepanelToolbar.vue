<template>
  <div class="side-toolbar">
    <div class="toolbar-group">
      <button
        id="selectElementBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_SELECT_ELEMENT_TOOLTIP')"
        :disabled="isSelectElementDebounced"
        :class="{ active: isSelectModeActive }"
        @click="handleSelectElement"
      >
        <img
          src="@/assets/icons/select.png"
          alt="Select Element"
          class="toolbar-icon"
        >
      </button>
      <button
        id="revertActionBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_REVERT_TOOLTIP')"
        @click="handleRevertAction"
      >
        <img
          src="@/assets/icons/revert.png"
          alt="Revert"
          class="toolbar-icon"
        >
      </button>
      <button
        id="clearFieldsBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_CLEAR_STORAGE_TITLE_ICON')"
        @click="handleClearFields"
      >
        <img
          src="@/assets/icons/clear.png"
          alt="Clear Fields"
          class="toolbar-icon"
        >
      </button>

      <div class="toolbar-separator" />

      <button
        id="apiProviderBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_API_PROVIDER_TOOLTIP')"
        :class="{ active: isApiDropdownVisible }"
        @click="handleApiProviderClick"
      >
        <img
          id="apiProviderIcon"
          :src="apiProviderIconSrc"
          alt="API Provider"
          class="toolbar-icon"
        >
      </button>
      <button
        id="historyBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_HISTORY_TOOLTIP')"
        :class="{ active: isHistoryVisible }"
        @click="handleHistoryClick"
      >
        <img
          src="@assets/icons/history.svg"
          alt="History"
          class="toolbar-icon"
        >
      </button>
    </div>
    <div class="toolbar-group-bottom">
      <button
        id="settingsBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_SETTINGS_TITLE_ICON')"
        @click="handleSettingsClick"
      >
        <img
          src="@assets/icons/settings.png"
          alt="Settings"
          class="toolbar-icon"
        >
      </button>
    </div>
  </div>
</template>

<script setup>
import { useMessaging } from '@/messaging/composables/useMessaging.js';
import { useSelectElementTranslation } from '@/composables/useTranslationModes.js';
import { useUI } from '@/composables/useUI.js';
import { computed, ref } from 'vue';

// Import icons statically to ensure they're bundled
import bingIcon from '@/assets/icons/api-providers/bing.svg';
import chromeTranslateIcon from '@/assets/icons/api-providers/chrome-translate.svg';
import customIcon from '@/assets/icons/api-providers/custom.svg';
import deepseekIcon from '@/assets/icons/api-providers/deepseek.svg';
import geminiIcon from '@/assets/icons/api-providers/gemini.svg';
import googleIcon from '@/assets/icons/api-providers/google.svg';
import openaiIcon from '@/assets/icons/api-providers/openai.svg';
import openrouterIcon from '@/assets/icons/api-providers/openrouter.svg';
import providerIcon from '@/assets/icons/api-providers/provider.svg';
import webaiIcon from '@/assets/icons/api-providers/webai.svg';
import yandexIcon from '@/assets/icons/api-providers/yandex.svg';
import { useApiProvider } from '@/composables/useApiProvider.js';

const props = defineProps({
  isApiDropdownVisible: {
    type: Boolean,
    default: false
  },
  isHistoryVisible: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['historyToggle', 'apiDropdownToggle', 'clear-fields'])

// Composables
const { showVisualFeedback } = useUI()
const { isSelectModeActive, toggleSelectElement } = useSelectElementTranslation()
const { currentProviderIcon } = useApiProvider()
const { sendMessage } = useMessaging('sidepanel')

// Icon mapping
const iconMap = {
  'google.svg': googleIcon,
  'gemini.svg': geminiIcon,
  'openai.svg': openaiIcon,
  'bing.svg': bingIcon,
  'yandex.svg': yandexIcon,
  'custom.svg': customIcon,
  'provider.svg': providerIcon,
  'chrome-translate.svg': chromeTranslateIcon,
  'deepseek.svg': deepseekIcon,
  'openrouter.svg': openrouterIcon,
  'webai.svg': webaiIcon
}

// Computed properties
const apiProviderIconSrc = computed(() => {
  if (currentProviderIcon.value) {
    const filename = currentProviderIcon.value.split('/').pop()
    return iconMap[filename] || googleIcon
  }
  return googleIcon
});

// Debounce logic
const isSelectElementDebounced = ref(false)

const handleSelectElement = async () => {
  if (isSelectElementDebounced.value) return
  isSelectElementDebounced.value = true
  setTimeout(() => { isSelectElementDebounced.value = false }, 500)

  try {
    await toggleSelectElement()
    showVisualFeedback(document.getElementById('selectElementBtn'), 'success')
  } catch (error) {
    console.error('[SidepanelToolbar] Error toggling element selection:', error)
    showVisualFeedback(document.getElementById('selectElementBtn'), 'error')
  }
}

const handleRevertAction = async () => {
  try {
    await sendMessage({ action: 'revertLastAction' })
    showVisualFeedback(document.getElementById('revertActionBtn'), 'success')
  } catch (error) {
    console.error('[SidepanelToolbar] Error reverting action:', error)
    showVisualFeedback(document.getElementById('revertActionBtn'), 'error')
  }
}

const handleClearFields = () => {
  emit('clear-fields')
  showVisualFeedback(document.getElementById('clearFieldsBtn'), 'success')
}

const handleApiProviderClick = () => {
  emit('apiDropdownToggle', !props.isApiDropdownVisible)
  showVisualFeedback(document.getElementById('apiProviderBtn'), 'success', 300)
}

const handleHistoryClick = () => {
  emit('historyToggle', !props.isHistoryVisible)
  showVisualFeedback(document.getElementById('historyBtn'), 'success', 300)
}

const handleSettingsClick = async () => {
  try {
    await sendMessage({ action: 'openOptionsPage' })
    showVisualFeedback(document.getElementById('settingsBtn'), 'success')
  } catch (error) {
    console.error('[SidepanelToolbar] Error opening settings:', error)
    showVisualFeedback(document.getElementById('settingsBtn'), 'error')
  }
}
</script>

<style lang="scss" scoped>
@use "@/assets/styles/variables.scss" as *;

.side-toolbar {
  width: 38px;
  background-color: var(--color-surface-alt);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
  z-index: 20;
  position: relative;
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.toolbar-group-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.toolbar-button {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: var(--color-background);
  }

  &.active {
    background-color: var(--color-primary);

    .toolbar-icon {
      filter: invert(1);
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    
    &:hover {
      background-color: transparent;
    }
  }
}

.toolbar-icon {
  width: 18px;
  height: 18px;
  filter: var(--icon-filter);
}

.toolbar-separator {
  width: 80%;
  height: 1px;
  background-color: var(--color-border);
  margin: $spacing-xs 0;
}
</style>