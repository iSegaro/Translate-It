<template>
  <div class="sidepanel-wrapper main-content">
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
      <!-- Temporarily disabled to debug error
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
      -->

      <!-- Source Text Area -->
      <TranslationInputField
        v-model="sourceText"
        :placeholder="'Enter text to translate...'"
        :source-language="sourceLanguageValue"
        :rows="6"
        :tabindex="1"
        :copy-title="'Copy source text'"
        :copy-alt="'Copy'"
        :tts-title="'Speak source text'"
        :tts-alt="'Voice Source'"
        :paste-title="'Paste from clipboard'"
        :paste-alt="'Paste'"
        :auto-translate-on-paste="false"
        @translate="handleTranslationSubmit"
        @input="handleSourceTextInput"
      />

      <!-- Result Area with Toolbar -->
      <TranslationDisplay
        :content="translatedText"
        :target-language="targetLanguageValue"
        :is-loading="isTranslating"
        :error="translationError"
        :placeholder="'Translation will appear here...'"
        :copy-title="'Copy Translation'"
        :copy-alt="'Copy Result'"
        :tts-title="'Speak Translation'"
        :tts-alt="'Voice Target'"
        mode="sidepanel"
        :enable-markdown="true"
        :show-fade-in-animation="true"
      />
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";


import { useErrorHandler } from "@/composables/useErrorHandler.js";
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/config.js";

import { useHistory } from "@/composables/useHistory.js";
import { useSidepanelTranslation } from "@/composables/useSidepanelTranslation.js";
import { getLanguageCode, getLanguageDisplayName } from "@/utils/i18n/languages.js";
import { useLanguages } from "@/composables/useLanguages.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";
import { useTranslationStore } from "@/store/modules/translation.js";

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelMainContent');

import TranslationDisplay from "@/components/shared/TranslationDisplay.vue";
import LanguageSelector from "@/components/shared/LanguageSelector.vue";
import TranslationInputField from "@/components/shared/TranslationInputField.vue";
import ProviderSelector from "@/components/shared/ProviderSelector.vue";
// removed legacy createLogger import


// browser API, TTS, Background Warmup, Select Element, and i18n



const { handleError } = useErrorHandler();

// Languages composable
const languages = useLanguages();

// Translation Store
const translationStore = useTranslationStore();

// Translation Composable
const translation = useSidepanelTranslation();

// Extract states from composable
const {
  sourceText,
  translatedText,
  isTranslating,
  translationError,
  canTranslate,
  triggerTranslation,
  loadLastTranslation,
  clearTranslation,
  _setTranslationResult,
  _setSourceText
} = translation;

// Local UI state (not related to translation)
const currentAbortController = ref(null);
// Bindings for LanguageSelector component (display names)
const sourceLang = ref('Auto-Detect');
const targetLang = ref('Persian');

const historyComposable = useHistory();



const targetLanguageValue = computed(() => targetLang.value || 'Persian');

const sourceLanguageValue = computed(() => sourceLang.value || AUTO_DETECT_VALUE);

// Watch for history changes to handle Firefox MV3 bug
watch(
  () => historyComposable.sortedHistoryItems,
  (newHistory) => {
    if (newHistory && newHistory.length > 0) {
      const lastItem = newHistory[0];
      
      // If the last history item matches the current source text, update the result
      if (
        lastItem.sourceText.trim() === sourceText.value.trim() &&
        (translatedText.value === "" || translatedText.value === null)
      ) {
        _setTranslationResult(lastItem.translatedText);
        isTranslating.value = false;
      }
    }
  },
  { deep: true },
);

// Watch for language changes
watch(
  () => sourceLang.value,
  (newValue, oldValue) => {
    if (oldValue !== undefined && newValue !== oldValue) {
      logger.info("🌍 Source language changed:", oldValue, "→", newValue);
    }
  }
);

watch(
  () => targetLang.value,
  (newValue, oldValue) => {
    if (oldValue !== undefined && newValue !== oldValue) {
      logger.info("🌍 Target language changed:", oldValue, "→", newValue);
    }
  }
);

// Watch for translation store changes (when history item is selected)
watch(
  () => translationStore.currentTranslation,
  (newTranslation) => {
    if (newTranslation && newTranslation.sourceText && newTranslation.translatedText) {
      logger.debug("🔄 Updating fields from translation store:", newTranslation);
      
      // Update source and translated text using internal methods
      _setSourceText(newTranslation.sourceText);
      _setTranslationResult(newTranslation.translatedText);
      
      // Update language selectors if language info is available
      if (newTranslation.sourceLanguage) {
        const sourceDisplayName = getLanguageDisplayName(newTranslation.sourceLanguage);
        if (sourceDisplayName) {
          sourceLang.value = sourceDisplayName;
        }
      }
      
      if (newTranslation.targetLanguage) {
        const targetDisplayName = getLanguageDisplayName(newTranslation.targetLanguage);
        if (targetDisplayName) {
          targetLang.value = targetDisplayName;
        }
      }
      
      // Clear any existing errors
      translationError.value = "";
      isTranslating.value = false;
    }
  },
  { deep: true }
);

// Watch for source text changes
watch(
  () => sourceText.value,
  (newValue, oldValue) => {
    if (oldValue !== undefined && newValue !== oldValue) {
      logger.debug("📝 Source text changed:", {
        from: oldValue?.substring(0, 30) + "...",
        to: newValue?.substring(0, 30) + "...",
        length: newValue?.length || 0
      });
    }
  }
);

// Handle form submission using composable
const handleTranslationSubmit = async () => {
  logger.debug("🎯 Translation button clicked");
  
  // Early return without warning since button is now disabled when conditions not met
  if (!canTranslate.value) {
    logger.warn("⚠️ Translation blocked - canTranslate is false");
    return;
  }

  try {
    logger.info("🚀 Starting translation process...");
    logger.debug("📝 Source text:", sourceText.value?.substring(0, 100) + "...");
    logger.debug("🌍 Source lang:", sourceLang.value, "→ Target lang:", targetLang.value);
    
    // Cancel previous request if exists
    if (currentAbortController.value) {
      logger.debug("🛑 Canceling previous translation request");
      currentAbortController.value.abort();
    }

    // Resolve display names to codes for translation
    const finalSourceLang = getLanguageCode(sourceLang.value) || await getSourceLanguageAsync();
    const finalTargetLang = getLanguageCode(targetLang.value) || await getTargetLanguageAsync();
    
    logger.debug("🔍 Resolved languages:", finalSourceLang, "→", finalTargetLang);
    
    // Start translation immediately - service worker will wake up when needed
    logger.debug("📡 Triggering translation...");
    const success = await triggerTranslation(finalSourceLang, finalTargetLang);
    
    if (success) {
      logger.info("✅ Translation completed successfully");
    } else {
      logger.warn("⚠️ Translation returned false/failed");
    }
  } catch (error) {
    logger.error("❌ Translation error caught:", error);
    await handleError(error, 'SidepanelMainContent-translation');
  }
};

// Event Handlers
const handleSourceTextInput = (event) => {
  logger.debug("[SidepanelMainContent] Source text changed:", event.target.value.substring(0, 30) + "...");
};

const handleClearFields = async () => {
  logger.debug("🧹 Clear fields event received");
  
  // Use translation composable's clear method
  clearTranslation();
  
  // Reset languages to saved settings
  try {
    const savedSource = await getSourceLanguageAsync()
    const savedTarget = await getTargetLanguageAsync()
    sourceLang.value = getLanguageDisplayName(savedSource) || getLanguageDisplayName(AUTO_DETECT_VALUE) || AUTO_DETECT_VALUE
    targetLang.value = getLanguageDisplayName(savedTarget) || 'Farsi'
    logger.debug("✅ Languages reset to saved settings:", savedSource, "→", savedTarget);
  } catch (error) {
    logger.error("❌ Failed to reset languages:", error);
  }
};



const handleFocus = () => {
  // Focus handling can be added here if needed
};

// Lifecycle - setup event listeners
onMounted(async () => {
  try {
    // Load languages first
  logger.debug("Loading languages...");
    await languages.loadLanguages();
  logger.debug("Languages loaded successfully");
    
    // Initialize language selector display values from settings
  logger.debug("Getting language settings...");
    try {
      const savedSource = await getSourceLanguageAsync();
      const savedTarget = await getTargetLanguageAsync();
      sourceLang.value = getLanguageDisplayName(savedSource) || getLanguageDisplayName(AUTO_DETECT_VALUE) || 'Auto-Detect';
      targetLang.value = getLanguageDisplayName(savedTarget) || 'Persian';
  logger.debug("Language settings loaded successfully");
    } catch (err) {
  logger.warn("Error loading language settings:", err);
      sourceLang.value = getLanguageDisplayName(AUTO_DETECT_VALUE) || 'Auto-Detect';
      targetLang.value = targetLang.value || 'Persian';
    }

    // Add focus listener for clipboard updates
  logger.debug("Adding focus listeners...");
    document.addEventListener("focus", handleFocus, true);
    window.addEventListener("focus", handleFocus);
    
    // Add clear fields listener
    document.addEventListener('clear-fields', handleClearFields);

    // Initialize translation data
  logger.debug("Loading last translation...");
    loadLastTranslation();

  logger.debug("Component mounted with Select Element integration");
  } catch (error) {
  logger.error("Error during component mounting:", error);
  }
});

onUnmounted(() => {
  // Clean up event listeners
  document.removeEventListener("focus", handleFocus, true);
  window.removeEventListener("focus", handleFocus);
  document.removeEventListener('clear-fields', handleClearFields);

  // Cancel any pending translation request
  if (currentAbortController.value) {
    currentAbortController.value.abort();
    currentAbortController.value = null;
  }
});</script>

<style scoped>
.main-content {
  width: 100%;
  height: 100%;
  padding: 4px 12px;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  box-sizing: border-box;
}

/* Select Element Status Styling */
.selection-status {
  background: var(--accent-primary);
  color: var(--text-on-accent);
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  animation: pulse 2s ease-in-out infinite;
}

.selection-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 500;
}

.selection-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-on-accent);
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.8;
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

/* Selection Mode Styling */
.textarea-container.selection-mode {
  opacity: 0.7;
  pointer-events: none;
}

.textarea-container.selection-mode textarea {
  background: var(--bg-secondary);
  border-color: var(--border-color);
}

form {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
}

/* Language control styles handled by shared component */

/* Textarea styles handled by TranslationInputField component */

.controls-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
}

.action-bar {
  display: flex;
  justify-content: flex-start;
}

.translate-button-main {
  background-color: var(--primary-color, #007bff);
  color: white;
  border: none;
  border-radius: 5px;
  padding: 10px 20px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s ease;
}

.translate-button-main:hover:not(:disabled) {
  background-color: var(--primary-color-hover, #0056b3);
}

.translate-button-main:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.translate-button-main img {
  width: 18px;
  height: 18px;
}

/* Result container */
.textarea-container.result-container {
  flex-grow: 1;
  min-height: 0;
  border: 1px solid var(--border-color, #dee2e6);
  border-radius: 5px;
  background-color: var(--bg-secondary, #ffffff);
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.result {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding-top: 32px;
  padding-bottom: 12px;
  padding-inline-start: 14px;
  padding-inline-end: 14px;
  color: var(--text-color, #212529);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.7;
  direction: ltr;
  text-align: left;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  min-width: 0;
}

/* Result placeholder */
.result:empty::before {
  content: attr(data-i18n-placeholder);
  color: #6c757d;
  pointer-events: none;
  position: absolute;
  top: 32px;
  left: 10px;
  right: 10px;
}

html[dir="rtl"] .result:empty::before {
  text-align: right;
}

.result.has-error {
  color: #d32f2f;
  background: #ffe6e6;
}

/* Spinner styles */
.spinner-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-color, #dee2e6);
  border-top: 3px solid var(--primary-color, #007bff);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Result fade-in animation */
.result.fade-in {
  animation: fadeIn 0.4s ease-in-out;
}

.result.hide-content {
  opacity: 0;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
