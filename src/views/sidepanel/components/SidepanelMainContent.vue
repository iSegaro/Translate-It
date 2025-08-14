<template>
  <div class="sidepanel-wrapper main-content">
    <form @submit.prevent="handleTranslationSubmit">
      <div class="controls-container">
        <LanguageSelector
          v-model:sourceLanguage="sourceLang"
          v-model:targetLanguage="targetLang"
          :disabled="isTranslating"
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
import { useTTSSmart } from "@/composables/useTTSSmart.js";
import { useSelectElementTranslation } from "@/composables/useTranslationModes.js";
import { useErrorHandler } from "@/composables/useErrorHandler.js";
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/config.js";
import { useI18n } from "@/composables/useI18n.js";
import { useHistory } from "@/composables/useHistory.js";
import { useSidepanelTranslation } from "@/composables/useSidepanelTranslation.js";
import { getLanguageCodeForTTS, getLanguageDisplayName, getLanguageCode } from "@/utils/i18n/languages.js";
import { useLanguages } from "@/composables/useLanguages.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.UI, 'SidepanelMainContent');
  }
  return _logger;
};

import TranslationDisplay from "@/components/shared/TranslationDisplay.vue";
import LanguageSelector from "@/components/shared/LanguageSelector.vue";
import TranslationInputField from "@/components/shared/TranslationInputField.vue";
import ProviderSelector from "@/components/shared/ProviderSelector.vue";
import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


// browser API, TTS, Background Warmup, Select Element, and i18n
const tts = useTTSSmart();

const selectElement = useSelectElementTranslation();
const { handleError } = useErrorHandler();
const { t } = useI18n();

// Languages composable
const languages = useLanguages();

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
  lastTranslation
} = translation;

// Local UI state (not related to translation)
const currentAbortController = ref(null);
// Bindings for LanguageSelector component (display names)
const sourceLang = ref('Auto-Detect');
const targetLang = ref('Persian');

const historyComposable = useHistory();

// Language lists - get from useLanguages composable 
const targetLanguages = computed(() => languages.targetLanguages.value || []);
const sourceLanguagesFiltered = computed(() => {
  // Get all languages except auto-detect (since we handle it separately)
  return (languages.allLanguages.value || []).filter(lang => lang.code !== 'auto');
});

// Computed properties for UI state
const hasSourceContent = computed(() => {
  return sourceText.value.trim().length > 0;
});

const hasTranslationContent = computed(() => {
  try {
    const translated = translatedText?.value || "";
    const error = translationError?.value || "";
    return (translated + error).trim().length > 0;
  } catch (err) {
    getLogger().warn('[SidepanelMainContent] Error in hasTranslationContent computed:', err);
    return false;
  }
});

// Select Element computed properties
const isSelecting = computed(() => {
  try {
    return selectElement?.isActivating?.value || false;
  } catch (err) {
    getLogger().warn('[SidepanelMainContent] Error in isSelecting computed:', err);
    return false;
  }
});
const isSelectElementActivating = computed(() => {
  try {
    return selectElement?.isActivating?.value || false;
  } catch (err) {
    getLogger().warn('[SidepanelMainContent] Error in isSelectElementActivating computed:', err);
    return false;
  }
});

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
        translatedText.value = lastItem.translatedText;
        translationError.value = ""; // Clear any potential Firefox bug error message
        isTranslating.value = false;
      }
    }
  },
  { deep: true },
);

// Handle form submission using composable
const handleTranslationSubmit = async () => {
  // Early return without warning since button is now disabled when conditions not met
  if (!canTranslate.value) {
    return;
  }

  try {
    // Cancel previous request if exists
    if (currentAbortController.value) {
      currentAbortController.value.abort();
    }

    // Resolve display names to codes for translation
    const finalSourceLang = getLanguageCode(sourceLang.value) || await getSourceLanguageAsync();
    const finalTargetLang = getLanguageCode(targetLang.value) || await getTargetLanguageAsync();
    
    // Start translation immediately - service worker will wake up when needed
    const success = await triggerTranslation(finalSourceLang, finalTargetLang);
  } catch (error) {
    getLogger().error("[SidepanelMainContent] Translation error caught:", error);
    await handleError(error, 'SidepanelMainContent-translation');
  }
};

// Copy source text to clipboard
const copySourceText = async () => {
  try {
    await navigator.clipboard.writeText(sourceText.value);
    getLogger().debug("[SidepanelMainContent] Source text copied to clipboard");
  } catch (error) {
    await handleError(error, 'SidepanelMainContent-copySource');
  }
};

// Copy translation text to clipboard
const copyTranslationText = async () => {
  try {
    await navigator.clipboard.writeText(translatedText.value);
    getLogger().debug("[SidepanelMainContent] Translation copied to clipboard");
  } catch (error) {
    await handleError(error, 'SidepanelMainContent-copyTranslation');
  }
};

// Listen for focus events to handle any UI updates if needed
const handleFocus = () => {
  // Focus handling can be added here if needed
};

// Handle source text input to update toolbar visibility
const handleSourceTextInput = () => {
  // This is called on input events - reactive hasSourceContent will automatically handle toolbar visibility
};

// Speak source text using TTS
const speakSourceText = async () => {
  const sourceLanguage = getLanguageCode(sourceLang.value) || AUTO_DETECT_VALUE;
  const langCode = getLanguageCodeForTTS(sourceLang.value || sourceLanguage);
  await tts.speak(sourceText.value, langCode);
  getLogger().debug(
    "[SidepanelMainContent] Source text TTS started with language:",
    { sourceLanguage, langCode }
  );
};

// Speak translation text using TTS
const speakTranslationText = async () => {
    const targetLanguageCode = getLanguageCode(targetLang.value) || AUTO_DETECT_VALUE;
  const langCode = getLanguageCodeForTTS(targetLang.value || targetLanguageCode);
  await tts.speak(translatedText.value, langCode);
  getLogger().debug(
    "[SidepanelMainContent] Translation TTS started with language:",
    { targetLanguage: targetLang.value, langCode }
  );
};

// Lifecycle - setup event listeners
onMounted(async () => {
  try {
    // Load languages first
    getLogger().debug("[SidepanelMainContent] Loading languages...");
    await languages.loadLanguages();
    getLogger().debug("[SidepanelMainContent] Languages loaded successfully");
    
    // Initialize language selector display values from settings
    getLogger().debug("[SidepanelMainContent] Getting language settings...");
    try {
      const savedSource = await getSourceLanguageAsync();
      const savedTarget = await getTargetLanguageAsync();
      sourceLang.value = getLanguageDisplayName(savedSource) || getLanguageDisplayName(AUTO_DETECT_VALUE) || 'Auto-Detect';
      targetLang.value = getLanguageDisplayName(savedTarget) || 'Persian';
      getLogger().debug("[SidepanelMainContent] Language settings loaded successfully");
    } catch (err) {
      getLogger().warn("[SidepanelMainContent] Error loading language settings:", err);
      sourceLang.value = getLanguageDisplayName(AUTO_DETECT_VALUE) || 'Auto-Detect';
      targetLang.value = targetLang.value || 'Persian';
    }

    // Add focus listener for clipboard updates
    getLogger().debug("[SidepanelMainContent] Adding focus listeners...");
    document.addEventListener("focus", handleFocus, true);
    window.addEventListener("focus", handleFocus);

    // Initialize translation data
    getLogger().debug("[SidepanelMainContent] Loading last translation...");
    loadLastTranslation();

    getLogger().debug("[SidepanelMainContent] Component mounted with Select Element integration");
  } catch (error) {
    getLogger().error("[SidepanelMainContent] Error during component mounting:", error);
  }
});

onUnmounted(() => {
  // Clean up event listeners
  document.removeEventListener("focus", handleFocus, true);
  window.removeEventListener("focus", handleFocus);

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
