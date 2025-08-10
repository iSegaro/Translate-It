<template>
  <div class="main-content">
    <form @submit.prevent="handleTranslationSubmit">
            <LanguageSelector
        v-model:sourceLanguage="sourceLang"
        v-model:targetLanguage="targetLang"
        :disabled="isTranslating"
        :auto-detect-label="'Auto-Detect'"
        :source-title="'Source Language'"
        :target-title="'Target Language'"
        :swap-title="'Swap Languages'"
        :swap-alt="'Swap'"
        @swap-languages="handleSwapLanguages"
      />

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

      <!-- Source Text Area with Toolbar -->
      <div
        class="textarea-container source-container"
        :class="{
          'has-content': hasSourceContent,
          'selection-mode': isSelecting,
        }"
      >
        <div class="inline-toolbar source-toolbar">
          <img
            id="copySourceBtn"
            src="@/assets/icons/copy.png"
            class="inline-icon"
            title="Copy Source Text"
            @click="copySourceText"
          >
          <img
            id="voiceSourceIcon"
            src="@/assets/icons/speaker.png"
            class="inline-icon"
            title="Speak Source Text"
            @click="speakSourceText"
          >
        </div>
        <img
          v-show="showPasteButton"
          id="pasteSourceBtn"
          src="@/assets/icons/paste.png"
          class="inline-icon paste-icon-separate"
          title="Paste Source Text"
          @click="pasteSourceText"
        >
        <textarea
          id="sourceText"
          v-model="sourceText"
          rows="6"
          placeholder="Enter text to translate..."
          @input="handleSourceTextInput"
        />
      </div>

      <!-- Action Bar -->
      <div class="action-bar">
        <button
          type="submit"
          class="translate-button-main"
          :disabled="!sourceText.trim()"
        >
          <span>{{ isTranslating ? "Translating..." : "Translate" }}</span>
          <img
            src="@/assets/icons/translate.png"
            alt="Translate"
          >
        </button>
      </div>

      <!-- Result Area with Toolbar -->
      <TranslationOutputField
        :content="translatedText"
        :language="targetLanguageValue"
        :is-loading="isTranslating"
        :error="translationError"
        :placeholder="'Translation will appear here...'"
        :copy-title="'Copy Translation'"
        :copy-alt="'Copy Result'"
        :tts-title="'Speak Translation'"
        :tts-alt="'Voice Target'"
        :show-fade-in-animation="true"
      />
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useTTSSmart } from "@/composables/useTTSSmart.js";
import { useBackgroundWarmup } from "@/composables/useBackgroundWarmup.js";
import { useSelectElementTranslation } from "@/composables/useTranslationModes.js";
import { useErrorHandler } from "@/composables/useErrorHandler.js";
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/config.js";
import { useI18n } from "@/composables/useI18n.js";
import { useHistory } from "@/composables/useHistory.js";
import { useSidepanelTranslation } from "@/composables/useSidepanelTranslation.js";
import { getLanguageCodeForTTS, getLanguageDisplayName, getLanguageCode, languageList } from "@/utils/i18n/languages.js";
import { useLanguages } from "@/composables/useLanguages.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";

import TranslationOutputField from "@/components/shared/TranslationOutputField.vue";
import LanguageSelector from "@/components/shared/LanguageSelector.vue";
import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = createLogger(LOG_COMPONENTS.UI, 'SidepanelMainContent');

// browser API, TTS, Background Warmup, Select Element, and i18n
const tts = useTTSSmart();
const backgroundWarmup = useBackgroundWarmup();
const selectElement = useSelectElementTranslation();
const { handleError } = useErrorHandler();
const { t } = useI18n();

// Languages composable
const languages = useLanguages();

// Translation Composable - SAME AS POPUP
const translation = useSidepanelTranslation();

// Extract states from composable - SAME AS POPUP
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
const showPasteButton = ref(true);
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
  return (
    (translatedText.value || translationError.value || "").trim().length > 0
  );
});

// Select Element computed properties
const isSelecting = computed(() => selectElement.isActivating.value);
const isSelectElementActivating = computed(
  () => selectElement.isActivating.value,
);

const targetLanguageValue = computed(() => targetLang.value || 'Persian');

const sourceLanguageValue = computed(() => sourceLang.value || AUTO_DETECT_VALUE);

// Watch for history changes to handle Firefox MV3 bug
watch(
  () => historyComposable.sortedHistoryItems,
  (newHistory) => {
    if (import.meta.env.DEV) {
      logger.debug(
        "[SidepanelMainContent] History watcher triggered. newHistory:",
        newHistory,
      );
    }
    if (newHistory && newHistory.length > 0) {
      const lastItem = newHistory[0];
      if (import.meta.env.DEV) {
        logger.debug("[SidepanelMainContent] Last history item:", lastItem);
        logger.debug(
          "[SidepanelMainContent] Current sourceText.value:",
          sourceText.value,
      );
        logger.debug(
          "[SidepanelMainContent] Current translatedText.value:",
          translatedText.value,
        );
      }

      // If the last history item matches the current source text, update the result
      if (
        lastItem.sourceText.trim() === sourceText.value.trim() &&
        (translatedText.value === "" || translatedText.value === null)
      ) {
        if (import.meta.env.DEV) {
          logger.debug(
            "[SidepanelMainContent] Watcher condition met: Updating translation from history.",
          );
        }
        if (import.meta.env.DEV) {
          logger.debug("  lastItem.sourceText:", lastItem.sourceText);
          logger.debug("  sourceText.value:", sourceText.value);
          logger.debug(
            "  translatedText.value (before update):",
            translatedText.value,
          );
        }
        
        translatedText.value = lastItem.translatedText;
        translationError.value = ""; // Clear any potential Firefox bug error message
        isTranslating.value = false;
        
        if (import.meta.env.DEV) {
          logger.debug(
            "  [History Watcher] translatedText.value (after update):",
            translatedText.value,
          );
          logger.debug(
            "  [History Watcher] translationError.value (after update):",
            translationError.value,
          );
          logger.debug(
            "  [History Watcher] isTranslating.value (after update):",
            isTranslating.value,
          );
        }
      } else if (import.meta.env.DEV) {
        logger.debug("[SidepanelMainContent] Watcher condition NOT met.");
        logger.debug("  lastItem.sourceText:", lastItem.sourceText);
        logger.debug("  sourceText.value:", sourceText.value);
        logger.debug(
          "  lastItem.sourceText === sourceText.value:",
          lastItem.sourceText === sourceText.value,
        );
        logger.debug("  translatedText.value:", translatedText.value);
        logger.debug(
          "  (translatedText.value === '' || translatedText.value === null):",
          translatedText.value === "" || translatedText.value === null,
        );
      }
    }
  },
  { deep: true },
);

// Handle form submission using composable - SAME AS POPUP
const handleTranslationSubmit = async () => {
  logger.debug("[SidepanelMainContent] Translation submit started");

  if (!canTranslate.value) {
    logger.warn("[SidepanelMainContent] Cannot translate - conditions not met");
    return;
  }

  try {
    // Cancel previous request if exists
    if (currentAbortController.value) {
      logger.debug("[SidepanelMainContent] Cancelling previous translation request");
      currentAbortController.value.abort();
    }

    // Ensure background is ready
    logger.debug("[SidepanelMainContent] Ensuring background script is ready...");
    await backgroundWarmup.ensureWarmedUp();

    // Resolve display names to codes for translation
    const finalSourceLang = getLanguageCode(sourceLang.value) || await getSourceLanguageAsync();
    const finalTargetLang = getLanguageCode(targetLang.value) || await getTargetLanguageAsync();
    logger.debug("[SidepanelMainContent] Triggering translation via composable with languages:", { source: finalSourceLang, target: finalTargetLang });
    const success = await triggerTranslation(finalSourceLang, finalTargetLang);
    logger.debug("[SidepanelMainContent] Translation completed:", success);
    
  } catch (error) {
    await handleError(error, 'SidepanelMainContent-translation');
  }
};

// Copy source text to clipboard
const copySourceText = async () => {
  try {
    await navigator.clipboard.writeText(sourceText.value);
    logger.debug("[SidepanelMainContent] Source text copied to clipboard");
  } catch (error) {
    await handleError(error, 'SidepanelMainContent-copySource');
  }
};

// Copy translation text to clipboard
const copyTranslationText = async () => {
  try {
    await navigator.clipboard.writeText(translatedText.value);
    logger.debug("[SidepanelMainContent] Translation copied to clipboard");
  } catch (error) {
    await handleError(error, 'SidepanelMainContent-copyTranslation');
  }
};

// Paste text into source textarea
const pasteSourceText = async () => {
  try {
    const text = await navigator.clipboard.readText();
    sourceText.value = text;
    // Trigger input event to update reactive properties
    handleSourceTextInput();
    logger.debug("[SidepanelMainContent] Text pasted from clipboard");
  } catch (error) {
    await handleError(error, 'SidepanelMainContent-paste');
  }
};

// Handle source text input to update toolbar visibility
const handleSourceTextInput = () => {
  // Reactive hasSourceContent will automatically handle toolbar visibility
  // This is called on input events
};

// Check clipboard for paste button visibility
const checkClipboard = async () => {
  try {
    logger.debug("[SidepanelMainContent] Checking clipboard...");
    const text = await navigator.clipboard.readText();
    const hasContent = text.trim().length > 0;

    showPasteButton.value = hasContent;
  } catch (error) {
    logger.debug(
      "[SidepanelMainContent] Clipboard check failed:",
      error.message,
    );
    // Fallback: show button always if permission denied
    showPasteButton.value = true;
  }
};

// Listen for focus events to update paste button
const handleFocus = () => {
  checkClipboard();
};

// Remove local function - use centralized getLanguageCodeForTTS instead

// Speak source text using TTS
const speakSourceText = async () => {
  const sourceLanguage = getLanguageCode(sourceLang.value) || AUTO_DETECT_VALUE;
  const langCode = getLanguageCodeForTTS(sourceLang.value || sourceLanguage);
  await tts.speak(sourceText.value, langCode);
  logger.debug(
    "[SidepanelMainContent] Source text TTS started with language:",
    { sourceLanguage, langCode }
  );
};

// Speak translation text using TTS
const speakTranslationText = async () => {
    const targetLanguageCode = getLanguageCode(targetLang.value) || AUTO_DETECT_VALUE;
  const langCode = getLanguageCodeForTTS(targetLang.value || targetLanguageCode);
  await tts.speak(translatedText.value, langCode);
  logger.debug(
    "[SidepanelMainContent] Translation TTS started with language:",
    { targetLanguage: targetLang.value, langCode }
  );
};

// Handle language swap functionality
const handleSwapLanguages = async () => {
  try {
    // Use display names from LanguageSelector and convert to codes
    let sourceVal = sourceLang.value;
    let targetVal = targetLang.value;

    logger.debug("[SidepanelMainContent] Current languages before swap:", { source: sourceVal, target: targetVal });

    let sourceCode = getLanguageCode(sourceVal);
    let targetCode = getLanguageCode(targetVal);

    let resolvedSourceCode = sourceCode;
    let resolvedTargetCode = targetCode;

    // If source is auto, try to use detected language from lastTranslation or settings
    if (sourceCode === AUTO_DETECT_VALUE) {
      if (lastTranslation.value && lastTranslation.value.sourceLanguage) {
        resolvedSourceCode = getLanguageCode(lastTranslation.value.sourceLanguage);
        logger.debug("[SidepanelMainContent] Using detected source language from last translation:", lastTranslation.value.sourceLanguage);
      } else {
        try {
          resolvedSourceCode = await getSourceLanguageAsync();
          logger.debug("[SidepanelMainContent] Resolved source language from settings:", resolvedSourceCode);
        } catch (err) {
          await handleError(err, 'SidepanelMainContent-loadSourceLanguage');
          resolvedSourceCode = null;
        }
      }
    }

    if (targetCode === AUTO_DETECT_VALUE) {
      try {
        resolvedTargetCode = await getTargetLanguageAsync();
        logger.debug("[SidepanelMainContent] Resolved target language from settings:", resolvedTargetCode);
      } catch (err) {
        await handleError(err, 'SidepanelMainContent-loadTargetLanguage');
        resolvedTargetCode = null;
      }
    }

    if (resolvedSourceCode && resolvedTargetCode && resolvedSourceCode !== AUTO_DETECT_VALUE) {
      // Use languages composable to get canonical display values where possible
      const newSourceDisplay = languages.getLanguageDisplayValue(resolvedTargetCode) || getLanguageDisplayName(resolvedTargetCode) || targetVal;
      const newTargetDisplay = languages.getLanguageDisplayValue(resolvedSourceCode) || getLanguageDisplayName(resolvedSourceCode) || sourceVal;

      sourceLang.value = newSourceDisplay;
      targetLang.value = newTargetDisplay;

      logger.debug("[SidepanelMainContent] Languages swapped successfully:", { from: `${sourceVal} → ${targetVal}`, to: `${newSourceDisplay} → ${newTargetDisplay}` });

      await nextTick();
      logger.debug("[DEBUG] Computed after swap (nextTick):", { computedSource: sourceLang.value, computedTarget: targetLang.value });
    } else if (resolvedSourceCode === AUTO_DETECT_VALUE) {
      // When source is auto, just swap target to auto and source to current target
      sourceLang.value = targetVal;
      targetLang.value = getLanguageDisplayName(AUTO_DETECT_VALUE) || 'Auto-Detect';

      logger.debug("[SidepanelMainContent] Auto-detect swap:", { from: `${AUTO_DETECT_VALUE} → ${targetVal}`, to: `${targetVal} → ${AUTO_DETECT_VALUE}` });

      await nextTick();
      logger.debug("[DEBUG] Computed after auto swap (nextTick):", { computedSource: sourceLang.value, computedTarget: targetLang.value });
    } else {
      logger.debug("[SidepanelMainContent] Cannot swap - invalid language selection", { resolvedSourceCode, resolvedTargetCode });
    }
  } catch (error) {
    await handleError(error, 'SidepanelMainContent-swapLanguages');
  }
};

// Remove local function

// Remove local function - use centralized getLanguageDisplayName instead



// Lifecycle - setup event listeners
onMounted(async () => {
  // Load languages first
  await languages.loadLanguages();
  
  // Initialize language selector display values from settings
  try {
    const savedSource = await getSourceLanguageAsync();
    const savedTarget = await getTargetLanguageAsync();
    sourceLang.value = getLanguageDisplayName(savedSource) || getLanguageDisplayName(AUTO_DETECT_VALUE) || 'Auto-Detect';
    targetLang.value = getLanguageDisplayName(savedTarget) || 'Persian';
  } catch (err) {
    sourceLang.value = getLanguageDisplayName(AUTO_DETECT_VALUE) || 'Auto-Detect';
    targetLang.value = targetLang.value || 'Persian';
  }

  // Suppress no-unused-vars warnings for template-used variables/functions
  // These are used in the template but not directly in the script setup block
  logger.debug(historyComposable); // Explicitly use historyComposable to satisfy linter
  hasTranslationContent.value;
  isSelectElementActivating.value;
  // Remove automatic clipboard/TTS operations on mount to prevent errors

  // Initial clipboard check
  checkClipboard();

  // Add focus listener for clipboard updates
  document.addEventListener("focus", handleFocus, true);
  window.addEventListener("focus", handleFocus);

  // Message listener is now handled by useSidepanelTranslation composable - SAME AS POPUP

  // Initialize translation data - SAME AS POPUP
  await loadLastTranslation();

  logger.debug(
    "[SidepanelMainContent] Component mounted with Select Element integration",
  );
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
  padding: 12px;
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

/* Language Controls */
.language-controls {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
  width: 100%;
  box-sizing: border-box;
}

.language-select {
  flex-grow: 1;
  flex-basis: 120px;
  min-width: 0;
  padding: 8px 10px;
  font-size: 14px;
  border: 1px solid var(--border-color, #dee2e6);
  border-radius: 4px;
  background-color: var(--bg-secondary, #ffffff);
  color: var(--text-color, #212529);
  box-sizing: border-box;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>');
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 16px;
  padding-right: 30px;
  filter: var(--icon-filter, none);
}

html[dir="rtl"] .language-select {
  background-position: left 10px center;
  padding-right: 10px;
  padding-left: 30px;
}

.swap-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.swap-button:hover {
  background-color: var(--toolbar-button-hover-bg, #dcdfe2);
}

.swap-button img {
  width: 16px;
  height: 16px;
  filter: var(--icon-filter, none);
}

/* Textarea Container */
.textarea-container {
  position: relative;
  display: flex;
  width: 100%;
  box-sizing: border-box;
}

.textarea-container.source-container {
  margin-bottom: 10px;
  flex-shrink: 0;
}

/* Source textarea - Match OLD implementation */
textarea#sourceText {
  width: 100%;
  height: 140px;
  resize: none;
  box-sizing: border-box;
  padding-top: 32px;
  padding-bottom: 12px;
  padding-inline-start: 14px;
  padding-inline-end: 14px;
  border: 1px solid var(--border-color, #dee2e6);
  border-radius: 5px;
  background-color: var(--bg-secondary, #ffffff);
  color: var(--text-color, #212529);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.7;
  direction: ltr;
  text-align: left;
  min-width: 0;
}

/* Action Bar */
.action-bar {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
  flex-shrink: 0;
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

/* Result placeholder - Match OLD implementation */
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

/* Inline Toolbar Styles - Match OLD implementation */
.inline-toolbar {
  position: absolute;
  top: 5px;
  left: 18px;
  display: none;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

/* Show toolbar only when container has content */
.textarea-container.has-content .inline-toolbar {
  display: flex;
}

.inline-icon {
  width: 16px;
  height: 16px;
  cursor: pointer;
  opacity: 0.6;
  transition:
    opacity 0.2s ease,
    filter 0.2s ease;
  filter: var(--icon-filter, none);
}

.inline-icon:hover {
  opacity: 1;
}

/* Force paste button to right side with high specificity */
.textarea-container.source-container .paste-icon-separate {
  position: absolute !important;
  top: 5px !important;
  right: 8px !important;
  left: auto !important;
  z-index: 10;
  opacity: 0.6;
  cursor: pointer;
  width: 16px;
  height: 16px;
  filter: var(--icon-filter, none);
  transition: opacity 0.2s ease;
}

.paste-icon-separate:hover {
  opacity: 1;
}

/* RTL support for paste button - Match OLD implementation */
html[dir="rtl"] .textarea-container.source-container .paste-icon-separate {
  left: 18px !important;
  right: auto !important;
}

/* Spinner styles - Match OLD implementation */
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
