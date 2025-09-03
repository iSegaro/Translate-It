<template>
  <div class="sidepanel-wrapper main-content enhanced">
    <UnifiedTranslationInput
        mode="sidepanel"
        :enhanced="true"
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
        @source-text-copied="handleSourceTextCopied"
        @source-text-pasted="handleSourceTextPasted"
        @source-tts-speaking="handleSourceTTSSpeaking"
        @translation-copied="handleTranslationCopied"
        @translation-tts-speaking="handleTranslationTTSSpeaking"
        @action-failed="handleActionFailed"
      />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";

import { useSelectElementTranslation } from "@/features/translation/composables/useTranslationModes.js";
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/shared/config/config.js";
import { useUnifiedI18n } from "@/composables/shared/useUnifiedI18n.js";
import { useUnifiedTranslation } from "@/features/translation/composables/useUnifiedTranslation.js";

import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'EnhancedSidepanelMainContent');

import UnifiedTranslationInput from "@/components/shared/UnifiedTranslationInput.vue";

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
  logger.debug("[EnhancedSidepanelMainContent] Component mounted");
  
  // Load saved languages asynchronously (non-blocking)
  Promise.all([
    getSourceLanguageAsync(),
    getTargetLanguageAsync()
  ]).then(([sourceLanguage, targetLanguage]) => {
    sourceLang.value = sourceLanguage;
    targetLang.value = targetLanguage;
  }).catch(error => {
    logger.error("[EnhancedSidepanelMainContent] Language loading failed:", error);
  });
  
  // Load last translation through unified composable
  try {
    translation.loadLastTranslation();
  } catch (error) {
    logger.error("[EnhancedSidepanelMainContent] Translation loading failed:", error);
  }
});

</script>

<style scoped>
.enhanced {
  position: relative;
}

.enhanced-input-section,
.enhanced-result-section {
  margin-bottom: 1rem;
}

.input-label {
  display: block;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--color-text, var(--text-color, #212121));
  margin-bottom: 0.5rem;
}

.input-container {
  position: relative;
  border: 1px solid var(--color-border, var(--border-color, #e0e0e0));
  border-radius: 8px;
  background: var(--color-background, var(--bg-color, #ffffff));
  transition: border-color 0.2s ease;
}

.input-container:focus-within {
  border-color: var(--color-primary);
}

.translation-textarea.enhanced {
  width: 100%;
  min-height: 120px;
  padding: 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text, var(--text-color, #212121));
  resize: vertical;
  font-family: inherit;
  outline: none;
}

.translation-textarea.enhanced::placeholder {
  color: var(--color-text-placeholder, var(--placeholder-color, #9aa0a6));
}

/* Enhanced result section now uses TranslationDisplay */
.enhanced-result-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Custom styles for sidepanel mode in TranslationDisplay */
.enhanced-result-section :deep(.sidepanel-result-container) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.enhanced-result-section :deep(.sidepanel-result-content) {
  flex: 1;
  min-height: 120px;
}

/* Responsive adjustments */
@media (max-width: 480px) {
  .input-container {
    border-radius: 6px;
  }
  
  .translation-textarea.enhanced {
    padding: 10px;
    font-size: 13px;
  }
  
  .enhanced-result-section :deep(.translation-content) {
    padding: 10px;
    font-size: 13px;
  }
}

.translate-button-main {
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 5px 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 16px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.translate-button-main:hover {
  background-color: var(--color-primary-dark);
}
</style>
