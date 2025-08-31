<template>
  <div class="sidepanel-wrapper main-content enhanced">
    <form @submit.prevent="handleTranslationSubmit">
      <div class="controls-container">
        <LanguageSelector
          v-model:source-language="sourceLang"
          v-model:target-language="targetLang"
          :auto-detect-label="'Auto-Detect'"
          :source-title="'Source Language'"
          :target-title="'Target Language'"
          :swap-title="'Swap Languages'"
          :swap-alt="'Swap'"
        />
        <ProviderSelector
          mode="split"
          :disabled="!canTranslate"
          @translate="handleTranslationSubmit"
        />
      </div>

      <!-- Select Element Status -->
      <div
        v-if="isSelecting"
        class="selection-status"
      >
        <div class="selection-indicator">
          <div class="selection-spinner" />
          <span>{{
            t(
              "SELECT_ELEMENT_ACTIVE_MESSAGE",
              "Click on any element on the webpage to translate...",
            )
          }}</span>
        </div>
      </div>

      <!-- Enhanced Source Text Area -->
      <div class="enhanced-input-section">
        <label class="input-label">{{ t("SOURCE_TEXT", "Source Text") }}:</label>
        <div class="input-container">
          <textarea
            ref="sourceTextareaRef"
            v-model="sourceText"
            :placeholder="t('ENTER_TEXT_TO_TRANSLATE', 'Enter text to translate...')"
            :rows="6"
            :tabindex="1"
            class="translation-textarea enhanced"
            @input="handleSourceTextInput"
            @keydown="handleKeydown"
          />
          <ActionToolbar
            :text="sourceText"
            :language="sourceLanguageValue"
            mode="sidepanel"
            position="top-right"
            :visible="true"
            :show-copy="true"
            :show-paste="true"
            :show-tts="true"
            :copy-disabled="sourceText.length === 0"
            :tts-disabled="sourceText.length === 0"
            size="md"
            variant="secondary"
            :auto-translate-on-paste="autoTranslateOnPaste"
            :copy-title="t('COPY_SOURCE_TEXT', 'Copy source text')"
            :paste-title="t('PASTE_FROM_CLIPBOARD', 'Paste from clipboard')"
            :tts-title="t('SPEAK_SOURCE_TEXT', 'Speak source text')"
            @text-copied="handleSourceTextCopied"
            @text-pasted="handleSourceTextPasted"
            @tts-speaking="handleSourceTTSSpeaking"
            @action-failed="handleActionFailed"
          />
        </div>
      </div>

      <!-- Enhanced Result Area -->
      <div class="enhanced-result-section">
        <label class="input-label">{{ t("TRANSLATION", "Translation") }}:</label>
        <TranslationDisplay
          :content="translatedText"
          :target-language="targetLanguageValue"
          :is-loading="isTranslating"
          :error="translationError"
          mode="sidepanel"
          :placeholder="t('TRANSLATION_PLACEHOLDER', 'Translation will appear here...')"
          :copy-title="t('COPY_TRANSLATION', 'Copy translation')"
          :tts-title="t('SPEAK_TRANSLATION', 'Speak translation')"
          container-class="sidepanel-result-container"
          content-class="sidepanel-result-content"
          @text-copied="handleTranslationCopied"
          @tts-speaking="handleTranslationTTSSpeaking"
          @action-failed="handleActionFailed"
        />
      </div>
    </form>

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
import { ref, computed, onMounted, watch, nextTick } from "vue";

import { useSelectElementTranslation } from "@/composables/useTranslationModes.js";
import { useErrorHandler } from "@/composables/useErrorHandler.js";
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/config.js";
import { useI18n } from "@/composables/useI18n.js";

import { useSidepanelTranslation } from "@/composables/useSidepanelTranslation.js";
import { getLanguageCode } from "@/utils/i18n/languages.js";

import { AUTO_DETECT_VALUE } from "@/constants.js";

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'EnhancedSidepanelMainContent');

import LanguageSelector from "@/components/shared/LanguageSelector.vue";
import ProviderSelector from "@/components/shared/ProviderSelector.vue";
import ActionToolbar from "@/components/shared/actions/ActionToolbar.vue";
import TranslationDisplay from "@/components/shared/TranslationDisplay.vue";
// removed legacy createLogger import



// Composables
const selectElement = useSelectElementTranslation();
const { handleError } = useErrorHandler();
const { t } = useI18n();

// Translation composable
const {
  sourceText,
  translatedText,
  isTranslating,
  translationError,
  canTranslate,
  triggerTranslation,
  loadLastTranslation
} = useSidepanelTranslation();

// Refs
const sourceTextareaRef = ref(null);

// State
const sourceLang = ref(AUTO_DETECT_VALUE);
const targetLang = ref("English");
const autoTranslateOnPaste = ref(false);
const showFadeInAnimation = ref(false);
const statusMessage = ref("");
const statusType = ref("info");

// Computed
const sourceLanguageValue = computed(() => {
  return sourceLang.value === AUTO_DETECT_VALUE ? "auto" : getLanguageCode(sourceLang.value);
});

const targetLanguageValue = computed(() => {
  return getLanguageCode(targetLang.value);
});

const isSelecting = computed(() => selectElement.isSelectModeActive.value);


// Event Handlers
const handleSourceTextInput = (event) => {
  logger.debug("[EnhancedSidepanelMainContent] Source text changed:", event.target.value.substring(0, 30) + "...");
};

const handleKeydown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    handleTranslationSubmit();
  }
};

const handleTranslationSubmit = async () => {
  if (!canTranslate.value) return;
  
  try {
    logger.debug("[EnhancedSidepanelMainContent] Starting translation");
    await triggerTranslation(sourceLang.value, targetLang.value);
    
    showFadeInAnimation.value = true;
    setTimeout(() => {
      showFadeInAnimation.value = false;
    }, 600);
    
    showStatus("Translation completed!", "success", 2000);
  } catch (error) {
    logger.error("[EnhancedSidepanelMainContent] Translation failed:", error);
    await handleError(error, "enhanced-sidepanel-translation");
    showStatus("Translation failed", "error", 3000);
  }
};

// Action Handlers
const handleSourceTextCopied = () => {
  logger.debug("[EnhancedSidepanelMainContent] Source text copied");
  showStatus("Source text copied to clipboard!", "success", 2000);
};

const handleSourceTextPasted = (event) => {
  logger.debug("[EnhancedSidepanelMainContent] Text pasted:", event.text.substring(0, 30) + "...");
  sourceText.value = event.text;
  showStatus("Text pasted from clipboard!", "success", 2000);
  
  // Auto-resize textarea
  nextTick(() => {
    if (sourceTextareaRef.value) {
      sourceTextareaRef.value.style.height = "auto";
      sourceTextareaRef.value.style.height = sourceTextareaRef.value.scrollHeight + "px";
    }
  });
  
  // Auto-translate if enabled
  if (event.autoTranslate) {
    nextTick(() => {
      handleTranslationSubmit();
    });
  }
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
    
    // Load last translation
    await loadLastTranslation();
    
    // Auto-resize textarea if there's content
    if (sourceText.value && sourceTextareaRef.value) {
      nextTick(() => {
        sourceTextareaRef.value.style.height = "auto";
        sourceTextareaRef.value.style.height = sourceTextareaRef.value.scrollHeight + "px";
      });
    }
  } catch (error) {
    logger.error("[EnhancedSidepanelMainContent] Initialization failed:", error);
    await handleError(error, "enhanced-sidepanel-init");
  }
});

// Watch for translation result changes to trigger animations
watch(translatedText, (newValue, oldValue) => {
  if (newValue && newValue !== oldValue) {
    nextTick(() => {
      // TranslationDisplay handles animations internally
      showFadeInAnimation.value = true;
      setTimeout(() => {
        showFadeInAnimation.value = false;
      }, 600);
    });
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
