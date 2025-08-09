<template>
  <div class="main-content">
    <form @submit.prevent="handleTranslationSubmit">
      <div class="language-controls">
        <select
          id="targetLanguageInput"
          ref="targetLanguageInputRef"
          class="language-select"
          title="Target Language"
        >
          <option value="English">
            English
          </option>
          <option
            value="Persian"
            selected
          >
            Persian
          </option>
          <option value="Arabic">
            Arabic
          </option>
          <option value="French">
            French
          </option>
          <option value="German">
            German
          </option>
          <option value="Spanish">
            Spanish
          </option>
        </select>

        <button
          id="swapLanguagesBtn"
          type="button"
          class="swap-button"
          title="Swap Languages"
          @click="handleSwapLanguages"
        >
          <img
            src="@/assets/icons/swap.png"
            alt="Swap"
          >
        </button>

        <select
          id="sourceLanguageInput"
          ref="sourceLanguageInputRef"
          class="language-select"
          title="Source Language"
        >
          <option value="auto">
            Auto-Detect
          </option>
          <option value="English">
            English
          </option>
          <option value="Persian">
            Persian
          </option>
          <option value="Arabic">
            Arabic
          </option>
          <option value="French">
            French
          </option>
          <option value="German">
            German
          </option>
          <option value="Spanish">
            Spanish
          </option>
        </select>
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
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useTTSSmart } from "@/composables/useTTSSmart.js";
import { useBackgroundWarmup } from "@/composables/useBackgroundWarmup.js";
import { useSelectElementTranslation } from "@/composables/useTranslationModes.js";
import { useErrorHandler } from "@/composables/useErrorHandler.js";
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/config.js";
import { useI18n } from "@/composables/useI18n.js";
import { useHistory } from "@/composables/useHistory.js";
import { useSidepanelTranslation } from "@/composables/useSidepanelTranslation.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";

import TranslationOutputField from "@/components/shared/TranslationOutputField.vue";

// browser API, TTS, Background Warmup, Select Element, and i18n
const tts = useTTSSmart();
const backgroundWarmup = useBackgroundWarmup();
const selectElement = useSelectElementTranslation();
const { handleError } = useErrorHandler();
const { t } = useI18n();

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
const targetLanguageInputRef = ref(null);
const sourceLanguageInputRef = ref(null);

const historyComposable = useHistory();

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

const targetLanguageValue = computed(() => {
  const val = targetLanguageInputRef.value?.value || "Persian";
  console.log('[Debug] targetLanguageValue computed:', val);
  return val;
});

const sourceLanguageValue = computed(() => {
  const val = sourceLanguageInputRef.value?.value || AUTO_DETECT_VALUE;
  console.log('[Debug] sourceLanguageValue computed:', val);
  return val;
});

// Watch for history changes to handle Firefox MV3 bug
watch(
  () => historyComposable.sortedHistoryItems,
  (newHistory) => {
    if (import.meta.env.DEV) {
      console.debug(
        "[SidepanelMainContent] History watcher triggered. newHistory:",
        newHistory,
      );
    }
    if (newHistory && newHistory.length > 0) {
      const lastItem = newHistory[0];
      if (import.meta.env.DEV) {
        console.debug("[SidepanelMainContent] Last history item:", lastItem);
        console.debug(
          "[SidepanelMainContent] Current sourceText.value:",
          sourceText.value,
      );
        console.debug(
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
          console.debug(
            "[SidepanelMainContent] Watcher condition met: Updating translation from history.",
          );
        }
        if (import.meta.env.DEV) {
          console.debug("  lastItem.sourceText:", lastItem.sourceText);
          console.debug("  sourceText.value:", sourceText.value);
          console.debug(
            "  translatedText.value (before update):",
            translatedText.value,
          );
        }
        
        translatedText.value = lastItem.translatedText;
        translationError.value = ""; // Clear any potential Firefox bug error message
        isTranslating.value = false;
        
        if (import.meta.env.DEV) {
          console.debug(
            "  [History Watcher] translatedText.value (after update):",
            translatedText.value,
          );
          console.debug(
            "  [History Watcher] translationError.value (after update):",
            translationError.value,
          );
          console.debug(
            "  [History Watcher] isTranslating.value (after update):",
            isTranslating.value,
          );
        }
      } else if (import.meta.env.DEV) {
        console.debug("[SidepanelMainContent] Watcher condition NOT met.");
        console.debug("  lastItem.sourceText:", lastItem.sourceText);
        console.debug("  sourceText.value:", sourceText.value);
        console.debug(
          "  lastItem.sourceText === sourceText.value:",
          lastItem.sourceText === sourceText.value,
        );
        console.debug("  translatedText.value:", translatedText.value);
        console.debug(
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
  console.log("[SidepanelMainContent] Translation submit started");

  if (!canTranslate.value) {
    console.warn("[SidepanelMainContent] Cannot translate - conditions not met");
    return;
  }

  try {
    // Cancel previous request if exists
    if (currentAbortController.value) {
      console.log("[SidepanelMainContent] Cancelling previous translation request");
      currentAbortController.value.abort();
    }

    // Ensure background is ready
    console.log("[SidepanelMainContent] Ensuring background script is ready...");
    await backgroundWarmup.ensureWarmedUp();

    // Debug: Check DOM values directly before translation
    const domSourceVal = sourceLanguageInputRef.value?.value;
    const domTargetVal = targetLanguageInputRef.value?.value;
    console.log("[DEBUG] DOM values:", { domSource: domSourceVal, domTarget: domTargetVal });
    console.log("[DEBUG] Computed values:", { computedSource: sourceLanguageValue.value, computedTarget: targetLanguageValue.value });
    
    // Quick Fix: Use DOM values directly if computed values don't match
    let finalSourceLang = sourceLanguageValue.value;
    let finalTargetLang = targetLanguageValue.value;
    
    // If computed values don't match DOM, use DOM values directly
    if (finalSourceLang !== domSourceVal || finalTargetLang !== domTargetVal) {
      console.log("[QUICK_FIX] Computed values don't match DOM, using DOM values directly");
      finalSourceLang = domSourceVal || AUTO_DETECT_VALUE;
      finalTargetLang = domTargetVal || "Persian";
    }
    
    // Use composable translation function with corrected language values  
    console.log("[SidepanelMainContent] Triggering translation via composable with languages:", { source: finalSourceLang, target: finalTargetLang });
    const success = await triggerTranslation(finalSourceLang, finalTargetLang);
    
    console.log("[SidepanelMainContent] Translation completed:", success);
    
  } catch (error) {
    await handleError(error, 'SidepanelMainContent-translation');
  }
};

// Copy source text to clipboard
const copySourceText = async () => {
  try {
    await navigator.clipboard.writeText(sourceText.value);
    console.log("[SidepanelMainContent] Source text copied to clipboard");
  } catch (error) {
    await handleError(error, 'SidepanelMainContent-copySource');
  }
};

// Copy translation text to clipboard
const copyTranslationText = async () => {
  try {
    await navigator.clipboard.writeText(translatedText.value);
    console.log("[SidepanelMainContent] Translation copied to clipboard");
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
    console.log("[SidepanelMainContent] Text pasted from clipboard");
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
    console.log("[SidepanelMainContent] Checking clipboard...");
    const text = await navigator.clipboard.readText();
    const hasContent = text.trim().length > 0;

    showPasteButton.value = hasContent;
  } catch (error) {
    console.log(
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

// Helper function to convert language name to simple language code for Google TTS
const getLanguageCode = (languageName) => {
  const languageMap = {
    English: "en",
    Persian: "fa",
    Arabic: "ar",
    French: "fr",
    German: "de",
    Spanish: "es",
    Chinese: "zh",
    Hindi: "hi",
    Portuguese: "pt",
    Russian: "ru",
    Japanese: "ja",
    Korean: "ko",
    Italian: "it",
    Dutch: "nl",
    Turkish: "tr",
    [AUTO_DETECT_VALUE]: "en",
  };

  return languageMap[languageName] || "en";
};

// Speak source text using TTS
const speakSourceText = async () => {
  const sourceLanguage = sourceLanguageValue.value || AUTO_DETECT_VALUE;
  const langCode = getLanguageCode(sourceLanguage);
  await tts.speak(sourceText.value, langCode);
  console.log(
    "[SidepanelMainContent] Source text TTS started with language:",
    langCode,
  );
};

// Speak translation text using TTS
const speakTranslationText = async () => {
  const targetLanguage = targetLanguageValue.value || AUTO_DETECT_VALUE;
  const langCode = getLanguageCode(targetLanguage);
  await tts.speak(translatedText.value, langCode);
  console.log(
    "[SidepanelMainContent] Translation TTS started with language:",
    langCode,
  );
};

// Handle language swap functionality
const handleSwapLanguages = async () => {
  try {
    const sourceSelect = sourceLanguageInputRef.value;
    const targetSelect = targetLanguageInputRef.value;

    if (!sourceSelect || !targetSelect) {
      await handleError(new Error('Language select elements not found'), 'SidepanelMainContent-languageElements');
      return;
    }

    let sourceVal = sourceSelect.value;
    let targetVal = targetSelect.value;
    
    console.log("[SidepanelMainContent] Current languages before swap:", { sourceVal, targetVal });

    // Note: We only swap languages, not text content
    // Text content should remain in their respective fields

    // Get language codes
    let sourceCode = getLanguageCode(sourceVal);
    let targetCode = getLanguageCode(targetVal);

    let resolvedSourceCode = sourceCode;
    let resolvedTargetCode = targetCode;

    // If source is "auto-detect", try to get actual source language from last translation
    if (sourceCode === AUTO_DETECT_VALUE || sourceVal === AUTO_DETECT_VALUE) {
      // If we have a translation, use the detected source language
      if (lastTranslation.value && lastTranslation.value.sourceLanguage) {
        const detectedLang = lastTranslation.value.sourceLanguage;
        resolvedSourceCode = getLanguageCode(detectedLang);
        console.log(
          "[SidepanelMainContent] Using detected source language from last translation:",
          detectedLang,
        );
      } else {
        // Fallback to settings
        try {
          resolvedSourceCode = await getSourceLanguageAsync();
          console.log(
            "[SidepanelMainContent] Resolved source language from settings:",
            resolvedSourceCode,
          );
        } catch (err) {
          await handleError(err, 'SidepanelMainContent-loadSourceLanguage');
          resolvedSourceCode = null;
        }
      }
    }

    // In case target is somehow auto (shouldn't happen but for robustness)
    if (targetCode === AUTO_DETECT_VALUE || targetVal === AUTO_DETECT_VALUE) {
      try {
        resolvedTargetCode = await getTargetLanguageAsync();
        console.log(
          "[SidepanelMainContent] Resolved target language from settings:",
          resolvedTargetCode,
        );
      } catch (err) {
        await handleError(err, 'SidepanelMainContent-loadTargetLanguage');
        resolvedTargetCode = null;
      }
    }

    // Swap languages if both are valid
    if (resolvedSourceCode && resolvedTargetCode && resolvedSourceCode !== AUTO_DETECT_VALUE) {
      // Get display names for the resolved languages
      const newSourceDisplay = getLanguageDisplayName(resolvedTargetCode);
      const newTargetDisplay = getLanguageDisplayName(resolvedSourceCode);

      // Swap the language values
      sourceSelect.value = newSourceDisplay || targetVal;
      targetSelect.value = newTargetDisplay || sourceVal;

      console.log("[SidepanelMainContent] Languages swapped successfully:", { 
        from: `${sourceVal} → ${targetVal}`, 
        to: `${newSourceDisplay} → ${newTargetDisplay}` 
      });
      
      // Debug: Check DOM values immediately after swap
      console.log("[DEBUG] DOM after swap:", { 
        domSource: sourceSelect.value, 
        domTarget: targetSelect.value 
      });
      console.log("[DEBUG] Computed after swap (immediate):", { 
        computedSource: sourceLanguageValue.value, 
        computedTarget: targetLanguageValue.value 
      });
      
      // Wait for Vue reactivity to update
      await nextTick();
      console.log("[DEBUG] Computed after swap (nextTick):", { 
        computedSource: sourceLanguageValue.value, 
        computedTarget: targetLanguageValue.value 
      });
    } else if (resolvedSourceCode === AUTO_DETECT_VALUE) {
      // When source is auto, just swap the target to auto and source to current target
      sourceSelect.value = targetVal;
      targetSelect.value = AUTO_DETECT_VALUE;
      
      console.log("[SidepanelMainContent] Auto-detect swap:", { 
        from: `${AUTO_DETECT_VALUE} → ${targetVal}`, 
        to: `${targetVal} → ${AUTO_DETECT_VALUE}` 
      });
      
      // Debug: Check DOM values immediately after auto swap
      console.log("[DEBUG] DOM after auto swap:", { 
        domSource: sourceSelect.value, 
        domTarget: targetSelect.value 
      });
      console.log("[DEBUG] Computed after auto swap (immediate):", { 
        computedSource: sourceLanguageValue.value, 
        computedTarget: targetLanguageValue.value 
      });
      
      // Wait for Vue reactivity to update
      await nextTick();
      console.log("[DEBUG] Computed after auto swap (nextTick):", { 
        computedSource: sourceLanguageValue.value, 
        computedTarget: targetLanguageValue.value 
      });
    } else {
      // Cannot swap - provide feedback
      console.log(
        "[SidepanelMainContent] Cannot swap - invalid language selection",
        {
          resolvedSourceCode,
          resolvedTargetCode,
        },
      );
    }
  } catch (error) {
    await handleError(error, 'SidepanelMainContent-swapLanguages');
  }
};

// Helper function to get display name for language code
const getLanguageDisplayName = (langCode) => {
  const languageMap = {
    en: "English",
    fa: "Persian",
    ar: "Arabic",
    fr: "French",
    de: "German",
    es: "Spanish",
    zh: "Chinese",
    hi: "Hindi",
    pt: "Portuguese",
    ru: "Russian",
    ja: "Japanese",
    ko: "Korean",
    it: "Italian",
    nl: "Dutch",
    tr: "Turkish",
    [AUTO_DETECT_VALUE]: AUTO_DETECT_VALUE,
  };

  return languageMap[langCode] || langCode;
};



// Lifecycle - setup event listeners
onMounted(async () => {
  // Suppress no-unused-vars warnings for template-used variables/functions
  // These are used in the template but not directly in the script setup block
  console.log(historyComposable); // Explicitly use historyComposable to satisfy linter
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

  console.log(
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
});
</script>

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
