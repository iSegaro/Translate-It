<template>
  <div class="sidepanel-wrapper main-content">
    <!-- Language Controls Section -->
    <div class="language-controls">
      <!-- Language Selector Row -->
      <div class="language-selector-row">
        <LanguageSelector
          v-model:source-language="sourceLanguage"
          v-model:target-language="targetLanguage"
          :source-title="t('SIDEPANEL_SOURCE_LANGUAGE_TITLE', 'زبان مبدا')"
          :target-title="t('SIDEPANEL_TARGET_LANGUAGE_TITLE', 'زبان مقصد')"
          :swap-title="t('SIDEPANEL_SWAP_LANGUAGES_TITLE', 'جابجایی زبان‌ها')"
          :swap-alt="t('SIDEPANEL_SWAP_LANGUAGES_ALT', 'Swap')"
          :auto-detect-label="'Auto-Detect'"
        />
      </div>
      
      <!-- Translate Button Row -->
      <div class="translate-button-row">
        <ProviderSelector
          mode="split"
          :disabled="!canTranslateFromForm"
          @translate="handleTranslate"
          @provider-change="handleProviderChange"
        />
      </div>
    </div>


    <!-- Translation Form (similar to popup structure) -->
    <form
      class="translation-form"
      @submit.prevent="handleTranslate"
    >
      <!-- Source Input Field -->
      <TranslationInputField
        ref="sourceInputRef"
        v-model="sourceText"
        :placeholder="t('SIDEPANEL_SOURCE_TEXT_PLACEHOLDER', 'Enter text to translate...')"
        :language="currentSourceLanguage"
        :rows="6"
        :tabindex="1"
        :copy-title="t('SIDEPANEL_COPY_SOURCE_TITLE_ICON', 'Copy source text')"
        :copy-alt="t('SIDEPANEL_COPY_SOURCE_ALT_ICON', 'Copy')"
        :tts-title="t('SIDEPANEL_VOICE_SOURCE_TITLE_ICON', 'Speak source text')"
        :tts-alt="t('SIDEPANEL_VOICE_SOURCE_ALT_ICON', 'Voice Source')"
        :paste-title="t('SIDEPANEL_PASTE_SOURCE_TITLE_ICON', 'Paste from clipboard')"
        :paste-alt="t('SIDEPANEL_PASTE_SOURCE_ALT_ICON', 'Paste')"
        :auto-translate-on-paste="autoTranslateOnPaste"
        @translate="handleTranslate"
        @input="handleSourceInput"
        @keydown="handleKeydown"
      />

      <!-- Translation Display -->
      <div class="output-container">
        <TranslationDisplay
          ref="translationResultRef"
          :content="translatedText"
          :language="currentTargetLanguage"
          :is-loading="isTranslating"
          :error="translationError"
          :placeholder="t('SIDEPANEL_TARGET_TEXT_PLACEHOLDER', 'Translation result will appear here...')"
          :copy-title="t('SIDEPANEL_COPY_TARGET_TITLE_ICON', 'Copy translation')"
          :copy-alt="t('SIDEPANEL_COPY_TARGET_ALT_ICON', 'Copy Result')"
          :tts-title="t('SIDEPANEL_VOICE_TARGET_TITLE_ICON', 'Speak translation')"
          :tts-alt="t('SIDEPANEL_VOICE_TARGET_ALT_ICON', 'Voice Target')"
          mode="sidepanel"
          :enable-markdown="true"
          :show-fade-in-animation="true"
        />
      </div>
    </form>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useUnifiedTranslation } from '@/features/translation/composables/useUnifiedTranslation.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/shared/config/config.js";
import { getLanguageDisplayName } from '@/utils/i18n/languages.js'
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";

// Components
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import TranslationInputField from '@/components/shared/TranslationInputField.vue'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelMainContent');

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('sidepanel-main-content')

// Stores
const settingsStore = useSettingsStore()

// Composables
const { t } = useUnifiedI18n();
const translation = useUnifiedTranslation('sidepanel');
const { handleError } = useErrorHandler()

// Refs
const sourceInputRef = ref(null)
const translationResultRef = ref(null)

// State from composables
const {
  sourceText,
  translatedText,
  isTranslating,
  translationError,
  canTranslate,
  triggerTranslation,
  clearTranslation,
  loadLastTranslation
} = translation

// Language state management - matching popup approach
const sourceLanguage = ref(AUTO_DETECT_VALUE)
const targetLanguage = ref('English')
const autoTranslateOnPaste = ref(false)
const canTranslateFromForm = ref(false)

// Local state
const lastTranslation = ref(null)

// Computed

// Watch canTranslate and emit changes
watch(canTranslate, (newValue) => {
  canTranslateFromForm.value = newValue
}, { immediate: true })

// Watch for source text changes
watch(sourceText, (newValue, oldValue) => {
  if (oldValue !== undefined && newValue !== oldValue) {
    logger.debug("📝 Source text changed:", { length: newValue?.length || 0, preview: newValue?.substring(0, 50) + "..." });
  }
}, { deep: true })

// Watch for language changes
watch(sourceLanguage, (newValue, oldValue) => {
  logger.debug("🌍 Source language changed:", oldValue, "→", newValue);
}, { immediate: true })

watch(targetLanguage, (newValue, oldValue) => {
  logger.debug("🌍 Target language changed:", oldValue, "→", newValue);
}, { immediate: true })

// Reactive language values - these will update when settings change
const currentSourceLanguage = computed(() => {
  const lang = settingsStore.settings.SOURCE_LANGUAGE
  return lang
})
const currentTargetLanguage = computed(() => {
  const lang = settingsStore.settings.TARGET_LANGUAGE
  return lang
})

// Methods
const handleSourceInput = (_event) => {
  // Handled by TranslationInputField component
}

const handleKeydown = (_event) => {
  // Handled by TranslationInputField component
}

const handleTranslate = async () => {
  logger.debug("🎯 Translation button clicked");
  
  if (!canTranslate.value) {
    logger.warn("⚠️ Translation blocked - canTranslate is false");
    return;
  }
  
  try {
    logger.info("🚀 Starting translation process...");
    logger.debug("📝 Source text:", sourceText.value?.substring(0, 100) + "...");
    
    // Get current language values from language selector
    const sourceLanguageValue = sourceLanguage.value;
    const targetLanguageValue = targetLanguage.value;
    
    logger.debug("🌍 Languages:", sourceLanguageValue, "→", targetLanguageValue);
    
    // Store last translation for revert functionality
    lastTranslation.value = {
      source: sourceText.value,
      target: translatedText.value,
      sourceLanguage: sourceLanguageValue,
      targetLanguage: targetLanguageValue
    }
    
    // Use composable translation function with current language values
    logger.debug("📡 Triggering translation...");
    await triggerTranslation(sourceLanguageValue, targetLanguageValue)    
    logger.info("✅ Translation completed successfully");

  } catch (error) {
    logger.error("❌ Translation failed:", error);
    await handleError(error, 'sidepanel-translation')
  }
}

const handleProviderChange = (provider) => {
  logger.info("[SidepanelMainContent] 🔄 Provider changed to:", provider);
  // Provider change is handled automatically by the ProviderSelector
}

const clearFields = async () => {
  logger.debug("🧹 Clearing fields and resetting languages");
  clearTranslation();
  lastTranslation.value = null;
  try {
    const savedSource = await getSourceLanguageAsync();
    const savedTarget = await getTargetLanguageAsync();
    
    if (savedSource === 'auto' || savedSource === AUTO_DETECT_VALUE || !savedSource) {
      sourceLanguage.value = 'Auto-Detect';
    } else {
      sourceLanguage.value = getLanguageDisplayName(savedSource) || 'Auto-Detect';
    }
    
    targetLanguage.value = getLanguageDisplayName(savedTarget) || settingsStore.settings.TARGET_LANGUAGE || 'English';
    
    logger.debug("✅ Languages reset to saved settings:", savedSource, "→", savedTarget);
  } catch (error) {
    logger.error("❌ Failed to reset languages:", error);
  }
};

// Expose the clearFields method to the parent component
defineExpose({
  clearFields
});


// Event listeners
onMounted(async () => {
  logger.debug("[SidepanelMainContent] Component mounting...");
  
  // Initialize language refs with saved settings (matching popup approach)
  try {
    const savedSource = await getSourceLanguageAsync()
    const savedTarget = await getTargetLanguageAsync()
    
    // Handle source language - if it's auto/AUTO_DETECT_VALUE, use 'Auto-Detect'
    if (savedSource === 'auto' || savedSource === AUTO_DETECT_VALUE || !savedSource) {
      sourceLanguage.value = 'Auto-Detect'
    } else {
      sourceLanguage.value = getLanguageDisplayName(savedSource) || 'Auto-Detect'
    }
    
    // Handle target language
    targetLanguage.value = getLanguageDisplayName(savedTarget) || settingsStore.settings.TARGET_LANGUAGE || 'English'
    
    logger.debug("✅ Languages initialized from settings:", {
      savedSource,
      savedTarget,
      sourceLanguageValue: sourceLanguage.value,
      targetLanguageValue: targetLanguage.value
    })
  } catch (err) {
    logger.warn("Error loading language settings:", err)
    sourceLanguage.value = 'Auto-Detect'
    targetLanguage.value = settingsStore.settings.TARGET_LANGUAGE || 'English'
  }
  
  // Initialize translation data
  await loadLastTranslation()
});
</script>

<style scoped>
.sidepanel-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.main-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
}

.language-controls {
  display: flex;
  flex-direction: column;
  padding: 12px;
  margin: 0;
  gap: 12px;
  background: var(--language-controls-bg-color);
  box-sizing: border-box;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.language-selector-row {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 100%;
  overflow: visible;
  position: relative;
  z-index: 11;
  min-height: 40px;
  box-sizing: border-box;
}

.language-selector-row :deep(.language-controls) {
  width: 100%;
  max-width: 100%;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px;
  padding: 8px 0;
  margin: 0;
  background: transparent;
  height: auto;
  justify-content: space-between;
  flex-wrap: nowrap !important;
}

.language-selector-row :deep(.language-select) {
  flex: 1 1 auto !important;
  min-width: 80px;
  max-width: 150px !important;
  opacity: 1 !important;
  visibility: visible !important;
  display: block !important;
  position: relative !important;
  box-sizing: border-box !important;
}

.language-selector-row :deep(.swap-button) {
  flex: 0 0 32px !important;
  width: 32px;
  height: 32px;
  opacity: 1 !important;
  visibility: visible !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  position: relative !important;
  z-index: 12 !important;
  background: var(--color-bg-secondary) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 4px !important;
  box-sizing: border-box !important;
}

.language-selector-row :deep(.swap-button img) {
  opacity: 1 !important;
  visibility: visible !important;
  display: block !important;
  width: 16px !important;
  height: 16px !important;
}

.translate-button-row {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  position: relative;
  z-index: 5;
  min-height: 40px;
  box-sizing: border-box;
  margin-top: 8px;
}

.translate-button-row :deep(.provider-selector) {
  min-width: auto;
}


@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.translation-form {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  flex: 1;
}

/* Sidepanel-specific adjustments (similar to popup) */
.translation-form :deep(.textarea-container) {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-textarea-background);
  padding: 5px;
  margin: 6px 12px;
}

.translation-form :deep(.translation-textarea) {
  min-height: 120px;
  max-height: 200px;
  font-size: 13px;
  padding: 42px 8px 8px 8px;
}


.output-container {
  margin: 6px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}


.translation-form :deep(.result-content) {
  flex: 1;
  min-height: 0;
  max-height: none;
  font-size: 13px;
  height: 100%;
}

</style>