<template>
  <form
    class="translation-form"
    @submit.prevent="handleTranslate"
  >
    <!-- Source Input Field -->
    <TranslationInputField
      ref="sourceInputRef"
      v-model="sourceText"
      :placeholder="t('popup_source_text_placeholder') || 'متن را اینجا وارد کنید...'"
      :language="currentSourceLanguage"
      :rows="2"
      :tabindex="1"
      :copy-title="t('popup_copy_source_title_icon') || 'کپی'"
      :copy-alt="t('popup_copy_source_alt_icon') || 'Copy'"
      :tts-title="t('popup_voice_source_title_icon') || 'خواندن متن مبدا'"
      :tts-alt="t('popup_voice_source_alt_icon') || 'Voice Source'"
      :paste-title="t('popup_paste_source_title_icon') || 'چسباندن'"
      :paste-alt="t('popup_paste_source_alt_icon') || 'Paste'"
      :auto-translate-on-paste="settingsStore.settings.AUTO_TRANSLATE_ON_PASTE"
      @translate="handleTranslate"
      @input="handleSourceInput"
      @keydown="handleKeydown"
    />

    <!-- Translation Display -->
    <TranslationDisplay
      ref="translationResultRef"
      :content="translatedText"
      :language="currentTargetLanguage"
      :is-loading="isTranslating"
      :error="translationError"
      :placeholder="t('popup_target_text_placeholder') || 'Translation result will appear here...'"
      :copy-title="t('popup_copy_target_title_icon') || 'کپی نتیجه'"
      :copy-alt="t('popup_copy_target_alt_icon') || 'Copy Result'"
      :tts-title="t('popup_voice_target_title_icon') || 'خواندن متن مقصد'"
      :tts-alt="t('popup_voice_target_alt_icon') || 'Voice Target'"
      mode="popup"
      :enable-markdown="true"
      :show-fade-in-animation="true"
    />
  </form>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useUnifiedTranslation } from '@/features/translation/composables/useUnifiedTranslation.js'
import { usePopupResize } from '@/composables/usePopupResize.js'
import { useSettingsStore } from '@/store/core/settings'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/useUnifiedI18n.js'
import TranslationInputField from '@/components/shared/TranslationInputField.vue'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'PopupTranslationForm');

// Props
const props = defineProps({
  sourceLanguage: {
    type: String,
    required: true
  },
  targetLanguage: {
    type: String,
    required: true
  }
})

// Stores
const settingsStore = useSettingsStore()

// Emits
const emit = defineEmits(['can-translate-change'])

// Composables (lightweight popup version)
const translation = useUnifiedTranslation('popup')
const popupResize = usePopupResize()
const { handleError } = useErrorHandler()
const { t } = useUnifiedI18n()


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

// Local state
const lastTranslation = ref(null)

// Watch canTranslate and emit changes to parent
watch(canTranslate, (newValue) => {
  emit('can-translate-change', newValue)
}, { immediate: true })

// Watch for source text changes
watch(sourceText, (newValue, oldValue) => {
  if (oldValue !== undefined && newValue !== oldValue) {
    logger.debug("📝 Source text changed:", { length: newValue?.length || 0, preview: newValue?.substring(0, 50) + "..." });
  }
}, { deep: true })

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
    
    // Get current language values from props
    const sourceLanguage = props.sourceLanguage;
    const targetLanguage = props.targetLanguage;
    
    logger.debug("🌍 Languages:", sourceLanguage, "→", targetLanguage);
    
    // Store last translation for revert functionality
    lastTranslation.value = {
      source: sourceText.value,
      target: translatedText.value,
      sourceLanguage,
      targetLanguage
    }
    
    // Use composable translation function with current language values
    logger.debug("📡 Triggering translation...");
    await triggerTranslation(sourceLanguage, targetLanguage)    
    logger.info("✅ Translation completed successfully");

  } catch (error) {
    logger.error("❌ Translation failed:", error);
    await handleError(error, 'popup-translation')
  }
}

const clearStorage = () => {
  clearTranslation()
  lastTranslation.value = null
}

const revertTranslation = () => {
  if (lastTranslation.value) {
    sourceText.value = lastTranslation.value.target || ''
    translatedText.value = lastTranslation.value.source || ''
    
    // Swap languages too
    const tempSource = lastTranslation.value.targetLanguage
    const tempTarget = lastTranslation.value.sourceLanguage
    
    if (tempSource && tempTarget) {
      settingsStore.updateSettingAndPersist('SOURCE_LANGUAGE', tempSource)
      settingsStore.updateSettingAndPersist('TARGET_LANGUAGE', tempTarget)
    }
  }
}


// Event listeners
onMounted(async () => {
  logger.debug("Component mounting...");
  
  // Listen for global events from header component
  document.addEventListener('clear-storage', clearStorage)
  document.addEventListener('revert-translation', revertTranslation)
  document.addEventListener('translate-request', (_event) => {
    logger.debug("🔔 Translate request received from header");
    if (sourceText.value.trim()) {
      handleTranslate()
    }
  })
  document.addEventListener('languages-swapped', () => {
    // Note: We only swap languages, not text content
    // Text content should remain in their respective fields
  })
  
  // Initialize translation data
  await loadLastTranslation()
})

// Watch for translation changes and adjust popup size
watch(translatedText, (newText, oldText) => {
  if (newText && newText !== oldText) {
    // Wait for DOM update and handle resize immediately with fade-in
    nextTick(() => {
      // Get the result-content element directly from the component
      const component = translationResultRef.value
      const outputElement = component?.$el?.querySelector('.result-content') || 
                           document.querySelector('.result-content')
      
      if (outputElement) {
        // Start resize immediately to synchronize with fade-in animation (600ms)
        popupResize.handleTranslationResult(outputElement)
      }
    })
  } else if (!newText && oldText) {
    // Reset output field when translation is cleared
    const component = translationResultRef.value
    const outputElement = component?.$el?.querySelector('.result-content') || 
                         document.querySelector('.result-content')
    if (outputElement) {
      popupResize.resetOutputField(outputElement)
    }
  }
})

// Watch for loading state to reset layout when new translation starts
watch(isTranslating, (newLoading, oldLoading) => {
  if (newLoading && !oldLoading) {
    // Reset layout when starting new translation
    popupResize.resetLayout()
  }
})
</script>

<style scoped>
.translation-form {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  flex: 1;
}

/* Popup-specific adjustments */
.translation-form :deep(.textarea-container) {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-textarea-background);
  padding: 5px;
  margin: 6px 12px;
}

.translation-form :deep(.translation-textarea) {
  min-height: 50px;
  max-height: 120px;
  font-size: 13px;
  padding: 42px 8px 8px 8px;
}

.translation-form :deep(.translation-display.popup-mode) {
  margin: 6px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.translation-form :deep(.result-content) {
  flex: 1;
  min-height: 0;
  max-height: none;
  font-size: 13px;
  height: 100%;
}

.result {
  background-color: var(--bg-result-color);
  white-space: normal !important;
  word-wrap: break-word;
  overflow-y: auto;
}
</style>