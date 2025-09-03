<template>
  <div class="sidepanel-wrapper main-content">
    <UnifiedTranslationInput
        mode="sidepanel"
        :enhanced="false"
        :show-controls="true"
        :show-language-selector="true"
        :show-provider-selector="true"
        :show-input-label="true"
        :show-result-label="true"
        :input-rows="6"
        :auto-translate-on-paste="autoTranslateOnPaste"
        :is-selecting="isSelecting"
        :initial-source-language="sourceLang"
        :initial-target-language="targetLang"
        :auto-detect-label="'Auto-Detect'"
        :source-title="'Source Language'"
        :target-title="'Target Language'"
        :swap-title="'Swap Languages'"
        :swap-alt="'Swap'"
        :input-label="t('SIDEPANEL_SOURCE_TEXT_LABEL', 'Source Text')"
        :result-label="t('SIDEPANEL_TARGET_TEXT_LABEL', 'Translation')"
        :input-placeholder="t('SIDEPANEL_SOURCE_TEXT_PLACEHOLDER', 'Enter text to translate...')"
        :result-placeholder="t('SIDEPANEL_TARGET_TEXT_PLACEHOLDER', 'Translation result will appear here...')"
        :copy-source-title="t('SIDEPANEL_COPY_SOURCE_TITLE_ICON', 'Copy source text')"
        :paste-title="t('SIDEPANEL_PASTE_SOURCE_TITLE_ICON', 'Paste from clipboard')"
        :tts-source-title="t('SIDEPANEL_VOICE_SOURCE_TITLE_ICON', 'Speak source text')"
        :copy-result-title="t('SIDEPANEL_COPY_TARGET_TITLE_ICON', 'Copy translation')"
        :tts-result-title="t('SIDEPANEL_VOICE_TARGET_TITLE_ICON', 'Speak translation')"
        :select-element-message="t('SIDEPANEL_SELECT_ELEMENT_MESSAGE', 'Click on any element on the webpage to translate...')"
        :provider-selector-mode="'split'"
        @can-translate-change="handleCanTranslateChange"
      />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";

import { useSelectElementTranslation } from "@/features/translation/composables/useTranslationModes.js";
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/shared/config/config.js";
import { useUnifiedI18n } from "@/composables/shared/useUnifiedI18n.js";
import { useUnifiedTranslation } from "@/features/translation/composables/useUnifiedTranslation.js";
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';

import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelMainContent');

import UnifiedTranslationInput from "@/components/shared/UnifiedTranslationInput.vue";

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('sidepanel-main-content')

// Composables
const selectElement = useSelectElementTranslation();
const { t } = useUnifiedI18n();

// Translation composable
const translation = useUnifiedTranslation('sidepanel');

// State
const sourceLang = ref(AUTO_DETECT_VALUE);
const targetLang = ref("English");
const autoTranslateOnPaste = ref(false);

// Computed
const isSelecting = computed(() => selectElement.isSelectModeActive.value);

// Event Handlers for UnifiedTranslationInput
const handleCanTranslateChange = (canTranslate) => {
  // UnifiedTranslationInput emits this event
};

// Lifecycle
onMounted(() => {
  logger.debug("[SidepanelMainContent] Component mounted");
  
  // Load saved languages asynchronously (non-blocking)
  Promise.all([
    getSourceLanguageAsync(),
    getTargetLanguageAsync()
  ]).then(([sourceLanguage, targetLanguage]) => {
    sourceLang.value = sourceLanguage;
    targetLang.value = targetLanguage;
  }).catch(error => {
    logger.error("[SidepanelMainContent] Language loading failed:", error);
  });
  
  // Load last translation through unified composable
  try {
    translation.loadLastTranslation();
  } catch (error) {
    logger.error("[SidepanelMainContent] Translation loading failed:", error);
  }
});
</script>

<style scoped>
.sidepanel-wrapper {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  position: relative;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  flex: 1;
}
</style>