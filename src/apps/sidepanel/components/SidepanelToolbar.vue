<template>
  <div class="side-toolbar">
    <div class="toolbar-group">
      <button
        id="selectElementBtn"
        class="toolbar-button"
        :title="t('SIDEPANEL_SELECT_ELEMENT_TOOLTIP')"
        :disabled="isActivating"
        :class="{ 'ti-active': isSelectModeActive }"
        @click="handleSelectElement"
      >
        <img
          :src="selectIcon"
          alt="Select Element"
          class="toolbar-icon"
        >
      </button>
      <button
        id="revertActionBtn"
        class="toolbar-button"
        :title="t('SIDEPANEL_REVERT_TOOLTIP')"
        @click="handleRevertAction"
      >
        <img
          :src="revertIcon"
          alt="Revert"
          class="toolbar-icon"
        >
      </button>
      <button
        id="clearFieldsBtn"
        class="toolbar-button"
        :title="t('SIDEPANEL_CLEAR_STORAGE_TITLE_ICON')"
        @click="handleClearFields"
      >
        <img
          :src="clearIcon"
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
        :title="t('SIDEPANEL_HISTORY_TOOLTIP')"
        :class="{ 'ti-active': isHistoryVisible }"
        @click="handleHistoryClick"
      >
        <img
          src="@/icons/ui/history.svg"
          alt="History"
          class="toolbar-icon"
        >
      </button>
    </div>
    <div class="toolbar-group-bottom">
      <button
        id="settingsBtn"
        class="toolbar-button"
        :title="t('SIDEPANEL_SETTINGS_TITLE_ICON')"
        @click="handleSettingsClick"
      >
        <img
          :src="settingsIcon"
          alt="Settings"
          class="toolbar-icon"
        >
      </button>
    </div>
  </div>
</template>

<script setup>

import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js';
import { useUI } from '@/composables/ui/useUI.js';
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js';
import browser from 'webextension-polyfill';

// Icon URLs will be loaded at runtime

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
  _logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelToolbar');
  }
  return _logger;
};

import ProviderSelector from '@/components/shared/ProviderSelector.vue';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';


const props = defineProps({
  isHistoryVisible: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['historyToggle', 'clear-fields'])

// Resource tracker for automatic cleanup

// Composables
const { t } = useUnifiedI18n()
const { sendMessage } = useMessaging('sidepanel')

// Composables
const { showVisualFeedback } = useUI()
const { isSelectModeActive, activateSelectMode, deactivateSelectMode, isActivating } = useSelectElementTranslation()
const { handleError, handleConnectionError } = useErrorHandler()

// Icon URLs using runtime.getURL
const selectIcon = browser.runtime.getURL('icons/ui/select.png')
const revertIcon = browser.runtime.getURL('icons/ui/revert.png')
const clearIcon = browser.runtime.getURL('icons/ui/clear.png')
const settingsIcon = browser.runtime.getURL('icons/ui/settings.png')

const handleSelectElement = async () => {
  getLogger().debug('Select Element button clicked! Mode:', isSelectModeActive.value ? 'Deactivating' : 'Activating')

  try {
    // Send request and wait for confirmation from background/content script
    if (isSelectModeActive.value) {
      getLogger().debug('🔄 Deactivating select element mode...')
      const result = await deactivateSelectMode()
      if (result) {
        getLogger().debug('Select element mode deactivated successfully')
        // composable will update shared state; UI follows isSelectModeActive
        showVisualFeedback(document.getElementById('selectElementBtn'), 'success')
      } else {
        getLogger().debug('Select element mode deactivation failed')
        showVisualFeedback(document.getElementById('selectElementBtn'), 'error')
      }
    } else {
      getLogger().debug('Activating select element mode...')
      const result = await activateSelectMode()
      if (result) {
        getLogger().debug('Select element mode activated successfully')
        // composable will update shared state; UI follows isSelectModeActive
        showVisualFeedback(document.getElementById('selectElementBtn'), 'success')
      } else {
        getLogger().debug('Select element mode activation failed')
        showVisualFeedback(document.getElementById('selectElementBtn'), 'error')
      }
    }
  } catch (error) {
    getLogger().error('Select element mode error:', error)
    showVisualFeedback(document.getElementById('selectElementBtn'), 'error')
    await handleError(error, 'SidepanelToolbar-selectElement')
  }
}

const handleRevertAction = async () => {
  getLogger().debug('Revert Action button clicked!')

  try {
    getLogger().debug('[SidepanelToolbar] Executing revert action')

    // Use sendMessage (goes through background script) for proper error handling
    const response = await sendMessage({
      action: MessageActions.REVERT_SELECT_ELEMENT_MODE,
      context: MessageContexts.SIDEPANEL,
      messageId: `sidepanel-revert-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      timestamp: Date.now()
    })

    getLogger().debug('[SidepanelToolbar] Revert response:', response)

    if (response?.success) {
      getLogger().debug(`[SidepanelToolbar] Revert successful: ${response.revertedCount || 0} translations reverted`)
      showVisualFeedback(document.getElementById('revertActionBtn'), 'success')
    } else if (response?.isRestrictedPage) {
      // Tab is restricted - log as debug and exit gracefully
      getLogger().debug('Revert action blocked (restricted page):', {
        message: response.message,
        tabUrl: response.tabUrl
      });
      showVisualFeedback(document.getElementById('revertActionBtn'), 'success')
      return;
    } else {
      const errorMsg = response?.error || response?.message || 'Unknown error'
      await handleError(new Error(`Revert failed: ${errorMsg}`), {
        context: 'sidepanel-toolbar-revert-failed',
        isSilent: true // Silent error handling for restricted pages
      })
      showVisualFeedback(document.getElementById('revertActionBtn'), 'error')
    }

  } catch (error) {
    // Check if this is a restricted page error with response data
    if (error.isRestrictedPage) {
      getLogger().debug('Revert action blocked (restricted page):', {
        message: error.message,
        tabUrl: error.tabUrl
      });
      showVisualFeedback(document.getElementById('revertActionBtn'), 'success')
      return; // Exit gracefully without showing error to user
    }

    // Handle all errors silently - ErrorHandler will automatically handle tab restriction errors silently
    await handleError(error, {
      context: 'SidepanelToolbar-revert',
      isSilent: true // Silent error handling for restricted pages
    })
    showVisualFeedback(document.getElementById('revertActionBtn'), 'error')
  }
}

const handleClearFields = () => {
  getLogger().debug('🧹 Clear Fields button clicked!')
  emit('clear-fields')
  showVisualFeedback(document.getElementById('clearFieldsBtn'), 'success')
}

const handleProviderChange = (provider) => {
  getLogger().debug('🔧 Provider changed in sidepanel toolbar to:', provider)
}

const handleHistoryClick = () => {
  getLogger().debug('📜 History button clicked! Current visibility:', props.isHistoryVisible, '→', !props.isHistoryVisible)
  emit('historyToggle', !props.isHistoryVisible)
  showVisualFeedback(document.getElementById('historyBtn'), 'success', 300)
}

const handleSettingsClick = async () => {
  getLogger().debug('⚙️ Settings button clicked!')
  try {
    await browser.runtime.openOptionsPage();
    getLogger().debug('Options page opened successfully')
    showVisualFeedback(document.getElementById('settingsBtn'), 'success')
  } catch (error) {
    getLogger().error('Failed to open options page:', error)
    await handleError(error, 'SidepanelToolbar-openSettings')
    showVisualFeedback(document.getElementById('settingsBtn'), 'error')
  }
};
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

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

  &.ti-active {
    background-color: var(--color-primary);

    /* Removed nested .toolbar-icon - now handled by global sidepanel styles with higher specificity */
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    
    &:hover {
      background-color: transparent;
    }
  }
}
/* Scoped styles for toolbar icons */
.toolbar-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.toolbar-separator {
  width: 80%;
  height: 1px;
  background-color: var(--color-border);
  margin: $spacing-xs 0;
}
</style>

