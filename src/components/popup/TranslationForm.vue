<template>
  <form
    class="translation-form"
    @submit.prevent="handleTranslate"
  >
    <!-- Source Input Field -->
    <TranslationInputField
      ref="sourceInputRef"
      v-model="sourceText"
      :placeholder="$i18n('popup_source_text_placeholder') || 'متن را اینجا وارد کنید...'"
      :language="currentSourceLanguage"
      :rows="2"
      :tabindex="1"
      :copy-title="$i18n('popup_copy_source_title_icon') || 'کپی'"
      :copy-alt="$i18n('popup_copy_source_alt_icon') || 'Copy'"
      :tts-title="$i18n('popup_voice_source_title_icon') || 'خواندن متن مبدا'"
      :tts-alt="$i18n('popup_voice_source_alt_icon') || 'Voice Source'"
      :paste-title="$i18n('popup_paste_source_title_icon') || 'چسباندن'"
      :paste-alt="$i18n('popup_paste_source_alt_icon') || 'Paste'"
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
      :placeholder="'نتیجه ترجمه اینجا نمایش داده می‌شود...'"
      :copy-title="$i18n('popup_copy_target_title_icon') || 'کپی نتیجه'"
      :copy-alt="$i18n('popup_copy_target_alt_icon') || 'Copy Result'"
      :tts-title="$i18n('popup_voice_target_title_icon') || 'خواندن متن مقصد'"
      :tts-alt="$i18n('popup_voice_target_alt_icon') || 'Voice Target'"
      mode="popup"
      :enable-markdown="true"
      :show-fade-in-animation="true"
    />
  </form>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { usePopupTranslation } from '@/composables/usePopupTranslation.js'
import { usePopupResize } from '@/composables/usePopupResize.js'
import { useSettingsStore } from '@/store/core/settings'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import TranslationInputField from '@/components/shared/TranslationInputField.vue'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'

// Stores
const settingsStore = useSettingsStore()

// Emits
const emit = defineEmits(['can-translate-change'])

// Composables (lightweight popup version)
const translation = usePopupTranslation()
const popupResize = usePopupResize()
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
  hasTranslation,
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
  if (!canTranslate.value) return
  
  try {
    // Get current language values from settings store
    const sourceLanguage = settingsStore.settings.SOURCE_LANGUAGE;
    const targetLanguage = settingsStore.settings.TARGET_LANGUAGE;
    
    // Store last translation for revert functionality
    lastTranslation.value = {
      source: sourceText.value,
      target: translatedText.value,
      sourceLanguage,
      targetLanguage
    }
    
    // Use composable translation function with current language values
    await triggerTranslation(sourceLanguage, targetLanguage)    

  } catch (error) {
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
  
  // Listen for global events from header component
  document.addEventListener('clear-storage', clearStorage)
  document.addEventListener('revert-translation', revertTranslation)
  document.addEventListener('translate-request', (_event) => {
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
  margin: 6px 12px;
}

.translation-form :deep(.translation-textarea) {
  min-height: 50px;
  max-height: 120px;
  font-size: 13px;
  padding: 30px 8px 8px 8px;
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
</style>