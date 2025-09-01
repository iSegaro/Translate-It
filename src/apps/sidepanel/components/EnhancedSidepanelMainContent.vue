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
      :input-label="t('SOURCE_TEXT', 'Source Text')"
      :result-label="t('TRANSLATION', 'Translation')"
      :input-placeholder="t('ENTER_TEXT_TO_TRANSLATE', 'Enter text to translate...')"
      :result-placeholder="t('TRANSLATION_PLACEHOLDER', 'Translation will appear here...')"
      :copy-source-title="t('COPY_SOURCE_TEXT', 'Copy source text')"
      :paste-title="t('PASTE_FROM_CLIPBOARD', 'Paste from clipboard')"
      :tts-source-title="t('SPEAK_SOURCE_TEXT', 'Speak source text')"
      :copy-result-title="t('COPY_TRANSLATION', 'Copy translation')"
      :tts-result-title="t('SPEAK_TRANSLATION', 'Speak translation')"
      :select-element-message="t('SELECT_ELEMENT_ACTIVE_MESSAGE', 'Click on any element on the webpage to translate...')"
      :provider-selector-mode="'split'"
      @can-translate-change="handleCanTranslateChange"
      @source-text-copied="handleSourceTextCopied"
      @source-text-pasted="handleSourceTextPasted"
      @source-tts-speaking="handleSourceTTSSpeaking"
      @translation-copied="handleTranslationCopied"
      @translation-tts-speaking="handleTranslationTTSSpeaking"
      @action-failed="handleActionFailed"
    />

    <!-- Status Bar -->
    <div
      v-if="statusMessage"
      class="status-bar"
    >
      <span :class="['status-message', statusType]">{{ statusMessage }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";

import { useSelectElementTranslation } from "@/features/translation/composables/useTranslationModes.js";
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/shared/config/config.js";
import { useI18n } from "@/composables/shared/useI18n.js";
import { useUnifiedTranslation } from "@/features/translation/composables/useUnifiedTranslation.js";

import { AUTO_DETECT_VALUE } from "@/constants.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'EnhancedSidepanelMainContent');

import UnifiedTranslationInput from "@/components/shared/UnifiedTranslationInput.vue";

// Composables
const selectElement = useSelectElementTranslation();
const { t } = useI18n();

// Translation composable
const translation = useUnifiedTranslation('sidepanel');

// State
const sourceLang = ref(AUTO_DETECT_VALUE);
const targetLang = ref("English");
const autoTranslateOnPaste = ref(false);
const statusMessage = ref("");
const statusType = ref("info");

// Computed
const isSelecting = computed(() => selectElement.isSelectModeActive.value);


// Event Handlers for UnifiedTranslationInput
const handleCanTranslateChange = (canTranslate) => {
  // UnifiedTranslationInput emits this event
};

const handleSourceTextCopied = () => {
  logger.debug("[EnhancedSidepanelMainContent] Source text copied");
  showStatus("Source text copied to clipboard!", "success", 2000);
};

const handleSourceTextPasted = (event) => {
  logger.debug("[EnhancedSidepanelMainContent] Text pasted:", event.text.substring(0, 30) + "...");
  showStatus("Text pasted from clipboard!", "success", 2000);
};

const handleSourceTTSSpeaking = () => {
  logger.debug("[EnhancedSidepanelMainContent] Playing source TTS");
  showStatus("Playing source text...", "info", 0);
};

const handleTranslationCopied = () => {
  logger.debug("[EnhancedSidepanelMainContent] Translation copied");
  showStatus("Translation copied to clipboard!", "success", 2000);
};

const handleTranslationTTSSpeaking = () => {
  logger.debug("[EnhancedSidepanelMainContent] Playing translation TTS");
  showStatus("Playing translation...", "info", 0);
};

const handleActionFailed = (event) => {
  logger.error("[EnhancedSidepanelMainContent] Action failed:", event);
  showStatus(`Action failed: ${event.error.message}`, "error", 3000);
};

// Status Management
const showStatus = (message, type = "info", duration = 2000) => {
  statusMessage.value = message;
  statusType.value = type;
  
  if (duration > 0) {
    setTimeout(() => {
      statusMessage.value = "";
    }, duration);
  }
};

// Lifecycle
onMounted(async () => {
  logger.debug("[EnhancedSidepanelMainContent] Component mounted");
  
  try {
    // Load saved languages
    sourceLang.value = await getSourceLanguageAsync();
    targetLang.value = await getTargetLanguageAsync();
    
    // Load last translation through unified composable
    translation.loadLastTranslation();
  } catch (error) {
    logger.error("[EnhancedSidepanelMainContent] Initialization failed:", error);
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
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.input-container {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
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
  color: var(--color-text-primary);
  resize: vertical;
  font-family: inherit;
  outline: none;
}

.translation-textarea.enhanced::placeholder {
  color: var(--color-text-placeholder);
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

.status-bar {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}

.status-message {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);
}

.status-message.success {
  background: var(--color-success-bg);
  border-color: var(--color-success);
  color: var(--color-success);
}

.status-message.error {
  background: var(--color-error-bg);
  border-color: var(--color-error);
  color: var(--color-error);
}

.status-message.info {
  background: var(--color-info-bg);
  border-color: var(--color-info);
  color: var(--color-info);
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
