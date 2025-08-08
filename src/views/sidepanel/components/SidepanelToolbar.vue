<template>
  <div class="side-toolbar">
    <div class="toolbar-group">
      <button
        id="selectElementBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_SELECT_ELEMENT_TOOLTIP')"
        :disabled="isSelectElementDebounced || isActivating"
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

      <ProviderSelector 
        mode="icon-only"
        @provider-change="handleProviderChange"
      />
      <button
        id="historyBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_HISTORY_TOOLTIP')"
        :class="{ active: isHistoryVisible }"
        @click="handleHistoryClick"
      >
        <img
          src="@/assets/icons/history.svg"
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
          src="@/assets/icons/settings.png"
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

import ProviderSelector from '@/components/shared/ProviderSelector.vue';
import { MessageActions } from '../../../messaging/core/MessageActions';

const props = defineProps({
  isHistoryVisible: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['historyToggle', 'clear-fields'])

// Composables
const { showVisualFeedback } = useUI()
const { isSelectModeActive, toggleSelectElement, activateSelectMode, deactivateSelectMode, isActivating } = useSelectElementTranslation()
const { sendMessage } = useMessaging('sidepanel')

// Debounce logic
const isSelectElementDebounced = ref(false)

const handleSelectElement = async () => {
  if (isSelectElementDebounced.value) return
  isSelectElementDebounced.value = true
  setTimeout(() => { isSelectElementDebounced.value = false }, 500)

  try {
    // Send request and wait for confirmation from background/content script
    if (isSelectModeActive.value) {
      const result = await deactivateSelectMode()
      if (result) {
        // composable will update shared state; UI follows isSelectModeActive
      }
    } else {
      const result = await activateSelectMode()
      if (result) {
        // composable will update shared state; UI follows isSelectModeActive
      }
    }
    showVisualFeedback(document.getElementById('selectElementBtn'), 'success')
  } catch (error) {
    console.error('[SidepanelToolbar] Error toggling element selection:', error)
    showVisualFeedback(document.getElementById('selectElementBtn'), 'error')
  }
}

const handleRevertAction = async () => {
  try {
    await sendMessage({ action: MessageActions.REVERT_SELECT_ELEMENT_MODE })
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

const handleProviderChange = (provider) => {
  console.log('[SidepanelToolbar] Provider changed to:', provider)
}

const handleHistoryClick = () => {
  emit('historyToggle', !props.isHistoryVisible)
  showVisualFeedback(document.getElementById('historyBtn'), 'success', 300)
}

const handleSettingsClick = async () => {
  try {
    await sendMessage({ action: MessageActions.openOptionsPage })
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

