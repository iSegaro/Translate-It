<template>
  <div class="side-toolbar">
    <div class="toolbar-group">
      <button
        v-if="isSelectElementEnabled"
        id="selectElementBtn"
        class="toolbar-button"
        :title="t('SIDEPANEL_SELECT_ELEMENT_TOOLTIP')"
        :disabled="isActivating"
        :class="{ 'ti-active': isSelectModeActive }"
        @click="handleSelectElement"
        @keydown.enter.prevent="handleSelectElement"
        @keydown.space.prevent="handleSelectElement"
      >
        <img
          :src="selectIcon"
          alt="Select Element"
          class="toolbar-icon"
        >
      </button>
      <button
        v-if="isSelectElementEnabled"
        id="revertActionBtn"
        class="toolbar-button"
        :title="t('SIDEPANEL_REVERT_TOOLTIP')"
        @click="handleRevertAction"
        @keydown.enter.prevent="handleRevertAction"
        @keydown.space.prevent="handleRevertAction"
      >
        <img
          :src="revertIcon"
          alt="Revert"
          class="toolbar-icon"
        >
      </button>

      <!-- Page Translation Button -->
      <div 
        v-if="isWholePageEnabled"
        class="toolbar-page-translation"
      >
        <PageTranslationButton 
          compact 
          :target-language="translationStore.uiTargetLanguage"
        />
      </div>

      <div class="toolbar-separator" />

      <ProviderSelector 
        v-model="currentProviderLocal"
        mode="icon-only"
        :is-global="true"
        @provider-change="handleProviderChange"
      />
      <button
        id="historyBtn"
        class="toolbar-button"
        :title="t('SIDEPANEL_HISTORY_TOOLTIP')"
        :class="{ 'ti-active': isHistoryVisible }"
        @click="handleHistoryClick"
        @keydown.enter.prevent="handleHistoryClick"
        @keydown.space.prevent="handleHistoryClick"
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
        @keydown.enter.prevent="handleSettingsClick"
        @keydown.space.prevent="handleSettingsClick"
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
import './SidepanelToolbar.scss'
import { computed } from 'vue';
import { useSelectElementTranslation, useSidepanelActions } from '@/features/translation/composables/useTranslationModes.js';
import { useTranslationStore } from '@/features/translation/stores/translation.js';
import { useUI } from '@/composables/ui/useUI.js';
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { useSettingsStore } from '@/features/settings/stores/settings.js';
import { TranslationMode } from '@/shared/config/config.js';
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
import PageTranslationButton from '@/features/page-translation/components/PageTranslationButton.vue';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const props = defineProps({
  isHistoryVisible: {
    type: Boolean,
    default: false
  },
  currentProvider: {
    type: String,
    default: ''
  }
})

// Emits
const emit = defineEmits(['historyToggle', 'update:currentProvider'])

// State
const currentProviderLocal = computed({
  get: () => props.currentProvider,
  set: (value) => emit('update:currentProvider', value)
})

// Resource tracker for automatic cleanup

// Stores
const settingsStore = useSettingsStore();
const translationStore = useTranslationStore();

// Composables
const { t } = useUnifiedI18n()
const { showVisualFeedback } = useUI()
const { isSelectModeActive, activateSelectMode, deactivateSelectMode, isActivating } = useSelectElementTranslation()
const { revertTranslation } = useSidepanelActions()
const { handleError } = useErrorHandler()

// Computed
const isExtensionEnabledGlobal = computed(() => {
  return settingsStore.settings?.EXTENSION_ENABLED ?? true
})

const isSelectElementEnabled = computed(() => {
  return isExtensionEnabledGlobal.value && (settingsStore.settings?.TRANSLATE_WITH_SELECT_ELEMENT ?? true)
})

const isWholePageEnabled = computed(() => {
  return isExtensionEnabledGlobal.value && (settingsStore.settings?.WHOLE_PAGE_TRANSLATION_ENABLED ?? true)
})

// Icon URLs using runtime.getURL
const selectIcon = browser.runtime.getURL('icons/ui/select.png')
const revertIcon = browser.runtime.getURL('icons/ui/revert.png')
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
      
      // Resolve provider based on hierarchy:
      // 1. If Sync is ON, use UI's active provider
      // 2. If Sync is OFF, use setting from MODE_PROVIDERS (if not null)
      // 3. Fallback to UI's active provider (legacy behavior)
      let effectiveProvider;
      if (translationStore.ephemeralSync.element && translationStore.selectedProvider) {
        effectiveProvider = translationStore.selectedProvider;
      } else {
        const modeKey = TranslationMode.Select_Element;
        const settingProvider = settingsStore.settings?.MODE_PROVIDERS?.[modeKey];
        effectiveProvider = settingProvider || props.currentProvider;
      }

      const result = await activateSelectMode({ 
        targetLanguage: translationStore.uiTargetLanguage,
        provider: effectiveProvider
      })
      if (result) {
        getLogger().debug('Select element mode activated successfully', { provider: effectiveProvider })
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
    getLogger().debug('[SidepanelToolbar] Executing revert action using composable')

    // Use composable method which handles all error scenarios
    const success = await revertTranslation()

    if (success) {
      getLogger().debug('[SidepanelToolbar] Revert successful')
      showVisualFeedback(document.getElementById('revertActionBtn'), 'success')
    } else {
      getLogger().debug('[SidepanelToolbar] Revert failed or was blocked')
      showVisualFeedback(document.getElementById('revertActionBtn'), 'error')
    }

  } catch (error) {
    getLogger().error('[SidepanelToolbar] Unexpected error in handleRevertAction:', error)
    showVisualFeedback(document.getElementById('revertActionBtn'), 'error')
  }
}

const handleProviderChange = (provider) => {
  getLogger().debug('🔧 Provider changed in sidepanel toolbar to:', provider)
}

const handleHistoryClick = () => {
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
