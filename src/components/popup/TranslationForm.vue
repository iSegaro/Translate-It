<template>
  <form
    class="ti-translation-form"
    @submit.prevent="handleTranslate"
  >
    <!-- Source Input Field -->
    <TranslationInputField
      ref="sourceInputRef"
      v-model="sourceText"
      :placeholder="t('popup_source_text_placeholder') || 'اینجا بنویسید'"
      :language="actualSourceLanguage"
      :detected-source-language="actualSourceLanguage"
      :last-translation="lastTranslation"
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
      :language="actualTargetLanguage"
      :target-language="actualTargetLanguage"
      :last-translation="lastTranslation"
      :is-loading="isTranslating"
      :error="translationError"
      :error-type="errorType"
      :placeholder="t('popup_target_text_placeholder') || 'Translation result will appear here'"
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
import { ref, onMounted, nextTick, watch } from 'vue'
import { useUnifiedTranslation } from '@/features/translation/composables/useUnifiedTranslation.js'
import { usePopupResize } from '@/composables/ui/usePopupResize.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import TranslationInputField from '@/components/shared/TranslationInputField.vue'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';

// Import adjacent SCSS
import './TranslationForm.scss';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'PopupTranslationForm');

// Resource tracker for memory management
const tracker = useResourceTracker('popup-translation-form');

// Props
const props = defineProps({
  sourceLanguage: {
    type: String,
    required: true
  },
  targetLanguage: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    default: ''
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
  errorType,
  canTranslate,
  actualSourceLanguage,
  actualTargetLanguage,
  lastTranslation,
  triggerTranslation,
  cancelTranslation,
  clearTranslation,
  loadLastTranslation
} = translation

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

// Methods
const handleSourceInput = (_event) => {
  // Handled by TranslationInputField component
}

const handleKeydown = (_event) => {
  // Handled by TranslationInputField component
}
/**
 * Main translation handler
 * @param {string} [manualProvider] - Optional provider ID to override props.provider
 */
const handleTranslate = async (manualProvider) => {
  logger.debug("Translation button clicked", { manualProvider });
  
  if (!canTranslate.value) {
    logger.debug("Translation skipped - input is empty or invalid");
    return;
  }
  
  try {
    logger.debug("Starting translation process...");
    
    // Use manualProvider if provided, otherwise fallback to props.provider
    const effectiveProvider = (typeof manualProvider === 'string' && manualProvider) ? manualProvider : props.provider;
    
    // Get current language values from props
    const sourceLanguage = props.sourceLanguage;
    const targetLanguage = props.targetLanguage;
    
    logger.debug("Languages:", sourceLanguage, "→", targetLanguage);
    
    // Store last translation for revert functionality
    lastTranslation.value = {
      source: sourceText.value,
      target: translatedText.value,
      sourceLanguage,
      targetLanguage
    }
    
    // Use composable translation function with determined provider
    logger.debug("Triggering translation...", { provider: effectiveProvider });
    const success = await triggerTranslation(sourceLanguage, targetLanguage, effectiveProvider)    
    
    if (success) {
      logger.info("Translation completed successfully");
    } else {
      logger.debug("Translation failed (handled internally)");
    }

  } catch (error) {
    logger.error("Translation failed:", error);
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
  tracker.addEventListener(document, 'clear-storage', clearStorage)
  tracker.addEventListener(document, 'revert-translation', revertTranslation)
  tracker.addEventListener(document, 'languages-swapped', () => {
    // Note: We only swap languages, not text content
    // Text content should remain in their respective fields
  })
  
  // Initialize translation data
  await loadLastTranslation()
})

// Helper function to get the translation content element
const getTranslationContentElement = () => {
  const component = translationResultRef.value
  let outputElement = null
  
  // In Vue 3, component refs work differently - try to get the element directly
  if (component && typeof component === 'object') {
    // If it's a component instance, try to access its root element
    if (component.$el) {
      outputElement = component.$el.querySelector('.result-content') || 
                     component.$el.querySelector('.translation-content')
    } else if (component.querySelector) {
      // If it's a DOM element directly
      outputElement = component.querySelector('.result-content') || 
                     component.querySelector('.translation-content')
    }
  }
  
  // Fallback to document query
  if (!outputElement) {
    outputElement = document.querySelector('.result-content') || 
                   document.querySelector('.translation-content')
  }
  
  return outputElement
}

// Watch for translation changes and adjust popup size
watch(translatedText, (newText, oldText) => {
  if (newText && newText !== oldText) {
    // Wait for DOM update and handle resize immediately with fade-in
    nextTick(() => {
      const outputElement = getTranslationContentElement()
      if (outputElement) {
        // Start resize immediately to synchronize with fade-in animation (600ms)
        popupResize.handleTranslationResult(outputElement)
      }
    })
  } else if (!newText && oldText) {
    // Reset output field when translation is cleared
    const outputElement = getTranslationContentElement()
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

// Expose methods and state to parent
defineExpose({
  triggerTranslation: handleTranslate,
  cancelTranslation,
  clearFields: clearStorage,
  isTranslating
})
</script>
