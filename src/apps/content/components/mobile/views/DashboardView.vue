<template>
  <div
    class="ti-m-dashboard-view"
    :class="{ 'is-dark': settingsStore.isDarkTheme }"
  >
    <div class="ti-m-dashboard-scroll-container">
      <!-- Translate Page Button -->
      <button class="ti-m-action-btn" @click="translatePage">
        <div class="ti-m-icon-container ti-m-icon-translate-page">
          <img :src="wholePageIcon" :alt="t('mobile_dashboard_page_label')" class="ti-toolbar-icon">
        </div>
        <span class="ti-m-action-label">{{ t('mobile_dashboard_page_label') || 'Page' }}</span>
      </button>

      <!-- Select Element Button -->
      <button class="ti-m-action-btn" @click="activateSelectElement">
        <div class="ti-m-icon-container ti-m-icon-select-element">
          <img :src="selectIcon" :alt="t('mobile_dashboard_select_label')" class="ti-toolbar-icon">
        </div>
        <span class="ti-m-action-label">{{ t('mobile_dashboard_select_label') || 'Select' }}</span>
      </button>

      <!-- Manual Translation Button -->
      <button class="ti-m-action-btn" @click="goToInputView">
        <div class="ti-m-icon-container ti-m-icon-manual-input">
          <img :src="inputIcon" :alt="t('mobile_dashboard_input_label')" class="ti-toolbar-icon">
        </div>
        <span class="ti-m-action-label">{{ t('mobile_dashboard_input_label') || 'Input' }}</span>
      </button>

      <!-- History Button -->
      <button class="ti-m-action-btn" @click="goToHistoryView">
        <div class="ti-m-icon-container ti-m-icon-history">
          <img :src="historyIcon" :alt="t('mobile_dashboard_history_label')" class="ti-toolbar-icon">
        </div>
        <span class="ti-m-action-label">{{ t('mobile_dashboard_history_label') || 'History' }}</span>
      </button>

      <!-- TTS Button (Dynamic) -->
      <button v-if="isTTSVisible" class="ti-m-action-btn" @click="handleTTS">
        <div
          class="ti-m-icon-container ti-m-icon-tts"
          :class="{ 'is-playing': tts.isPlaying.value }"
        >
          <div v-if="tts.isLoading.value" class="ti-m-tts-loader"></div>
          <img v-else :src="ttsIcon" :alt="t('mobile_selection_speak_tooltip')" class="ti-toolbar-icon">
        </div>
        <span class="ti-m-action-label">{{ tts.isPlaying.value ? t('mobile_selection_stop_label') : t('mobile_selection_speak_tooltip') }}</span>
      </button>

      <!-- Revert Element Translations (Dynamic) -->
      <button v-if="hasElementTranslations" class="ti-m-action-btn" @click="revertTranslations">
        <div class="ti-m-icon-container ti-m-icon-revert">
          <img :src="revertIcon" :alt="t('mobile_dashboard_revert_label')" class="ti-toolbar-icon">
        </div>
        <span class="ti-m-action-label">{{ t('mobile_dashboard_revert_label') || 'Revert' }}</span>
      </button>

      <!-- Settings Button -->
      <button class="ti-m-action-btn" @click="openSettings">
        <div class="ti-m-icon-container ti-m-icon-settings">
          <img :src="settingsIcon" :alt="t('mobile_dashboard_settings_label')" class="ti-toolbar-icon">
        </div>
        <span class="ti-m-action-label">{{ t('mobile_dashboard_settings_label') || 'Settings' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from '@/composables/shared/useI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js'
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

import wholePageIcon from '@/icons/ui/whole-page.png';
import selectIcon from '@/icons/ui/select.png';
import inputIcon from '@/icons/extension/extension_icon_128.svg';
import settingsIcon from '@/icons/ui/settings.png';
import revertIcon from '@/icons/ui/revert.png';
import historyIcon from '@/icons/ui/history.svg';
import ttsIcon from '@/icons/ui/speaker.png';

const logger = getScopedLogger(LOG_COMPONENTS.MOBILE, 'DashboardView');
const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { hasElementTranslations } = storeToRefs(mobileStore)
const { t } = useI18n()
const pageEventBus = window.pageEventBus
const tts = useTTSSmart();

const pendingSelection = ref({
  text: '',
  hasSelection: false
});

const isTTSVisible = computed(() => pendingSelection.value.hasSelection || tts.isPlaying.value);

const translatePage = (event) => {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  logger.info('Page translation requested from Mobile Dashboard');
  const isCurrentlyTranslating = mobileStore.pageTranslationData.isTranslating || mobileStore.pageTranslationData.isAutoTranslating || mobileStore.pageTranslationData.isTranslated;
  if (isCurrentlyTranslating) mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION)
  else { 
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE); 
    mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION);
    
    // Respect the auto-close setting
    if (settingsStore.settings.MOBILE_PAGE_TRANSLATION_AUTO_CLOSE) {
      mobileStore.closeSheet();
    }
  }
}

const activateSelectElement = () => { 
  logger.info('Select Element mode requested from Mobile Dashboard');
  mobileStore.closeSheet(); 
  pageEventBus.emit(MessageActions.ACTIVATE_SELECT_ELEMENT_MODE) 
}
const goToInputView = () => { 
  logger.debug('Navigating to Input View');
  mobileStore.resetSelectionData(); 
  mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.INPUT) 
}
const goToHistoryView = () => { 
  logger.debug('Navigating to History View');
  mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.HISTORY) 
}
const openSettings = () => { 
  logger.debug('Opening Settings from Mobile Dashboard');
  pageEventBus.emit(WINDOWS_MANAGER_EVENTS.OPEN_SETTINGS) 
}
const revertTranslations = () => { 
  logger.info('Reverting page translations from Mobile Dashboard');
  pageEventBus.emit('revert-translations') 
}

const handleTTS = async () => {
  if (tts.isPlaying.value) {
    logger.info('Stopping TTS from Mobile Dashboard');
    await tts.stop();
  } else if (pendingSelection.value.hasSelection) {
    logger.info('Starting TTS from Mobile Dashboard for selected text');
    await tts.speak(pendingSelection.value.text);
  }
};

const handleSelectionPending = (detail) => {
  logger.debug('Received global selection change event in Dashboard', { textLength: detail.text?.length });
  pendingSelection.value = {
    text: detail.text,
    hasSelection: !!detail.text
  };
};

const handleSelectionClear = () => {
  logger.debug('Received global selection clear event in Dashboard');
  pendingSelection.value = {
    text: '',
    hasSelection: false
  };
};

onMounted(() => {
  // Check for existing native selection
  const nativeSelection = window.getSelection()?.toString().trim();

  if (nativeSelection) {
    pendingSelection.value = {
      text: nativeSelection,
      hasSelection: true
    };
  }

  // Listen for global selection events (Coordinator Pattern)
  if (pageEventBus) {
    pageEventBus.on(SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, handleSelectionPending);
    pageEventBus.on(SELECTION_EVENTS.GLOBAL_SELECTION_CLEAR, handleSelectionClear);
  }
});

onUnmounted(() => {
  if (pageEventBus) {
    pageEventBus.off(SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, handleSelectionPending);
    pageEventBus.off(SELECTION_EVENTS.GLOBAL_SELECTION_CLEAR, handleSelectionClear);
  }
  });
  </script>