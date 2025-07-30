<template>
  <form @submit.prevent="handleTranslate" class="translation-form">
    <!-- Source Input Field -->
    <TranslationInputField
      v-model="sourceText"
      ref="sourceInputRef"
      :placeholder="$i18n('popup_source_text_placeholder') || 'متن را اینجا وارد کنید...'"
      :language="settingsStore.settings.SOURCE_LANGUAGE"
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

    <!-- Translation Output Field -->
    <TranslationOutputField
      ref="translationResultRef"
      :content="translatedText"
      :language="settingsStore.settings.TARGET_LANGUAGE"
      :is-loading="isTranslating"
      :error="translationError"
      :placeholder="'نتیجه ترجمه اینجا نمایش داده می‌شود...'"
      :copy-title="$i18n('popup_copy_target_title_icon') || 'کپی نتیجه'"
      :copy-alt="$i18n('popup_copy_target_alt_icon') || 'Copy Result'"
      :tts-title="$i18n('popup_voice_target_title_icon') || 'خواندن متن مقصد'"
      :tts-alt="$i18n('popup_voice_target_alt_icon') || 'Voice Target'"
      :enable-markdown="false"
      :show-fade-in-animation="true"
    />
  </form>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { usePopupTranslation } from '@/composables/usePopupTranslation.js'
import { useSelectElementTranslation } from '@/composables/useSelectElementTranslation.js'
import { useSettingsStore } from '@/store/core/settings'
import TranslationInputField from '@/components/shared/TranslationInputField.vue'
import TranslationOutputField from '@/components/shared/TranslationOutputField.vue'

// Stores
const settingsStore = useSettingsStore()

// Composables (lightweight popup version)
const translation = usePopupTranslation()

// Select Element Integration
const selectElementTranslation = useSelectElementTranslation()

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

// Methods
const handleSourceInput = (event) => {
  // Handled by TranslationInputField component
}

const handleKeydown = (event) => {
  // Handled by TranslationInputField component
}

const handleTranslate = async () => {
  if (!canTranslate.value) return
  
  try {
    // Store last translation for revert functionality
    lastTranslation.value = {
      source: sourceText.value,
      target: translatedText.value,
      sourceLanguage: settingsStore.settings.SOURCE_LANGUAGE,
      targetLanguage: settingsStore.settings.TARGET_LANGUAGE
    }
    
    // Use composable translation function (pass the result ref element)
    const success = await triggerTranslation(translationResultRef.value?.$refs?.resultRef)
    
    console.log('[PopupTranslationForm] Translation completed:', success)
    
  } catch (error) {
    console.error('[PopupTranslationForm] Translation error:', error)
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

// Select Element Integration
const setupSelectElementIntegration = () => {
  // Handle text extracted from selected elements
  selectElementTranslation.onTextExtracted.value = (extractedText, elementData) => {
    console.log('[TranslationForm] Text extracted from selected element:', extractedText)
    
    // Populate source text field
    sourceText.value = extractedText
    
    // Clear previous translation
    translatedText.value = ''
    translationError.value = ''
    
    // Focus on source input after population
    nextTick(() => {
      if (sourceInputRef.value?.focus) {
        sourceInputRef.value.focus()
      }
    })
    
    // Auto-translate if setting is enabled (for now using TRANSLATE_ON_TEXT_SELECTION as proxy)
    if (settingsStore.settings.TRANSLATE_ON_TEXT_SELECTION) {
      nextTick(async () => {
        if (extractedText.trim()) {
          await handleTranslate()
        }
      })
    }
  }
  
  // Handle mode changes (activation/deactivation)
  selectElementTranslation.onModeChanged.value = (isActive) => {
    console.log('[TranslationForm] Select element mode changed:', isActive)
    
    if (isActive) {
      // Visual feedback that select mode is active
      console.log('[TranslationForm] Select element mode activated - ready to receive text')
    } else {
      // Mode deactivated
      console.log('[TranslationForm] Select element mode deactivated')
    }
  }
}

// Event listeners
onMounted(async () => {
  // Setup select element integration
  setupSelectElementIntegration()
  
  // Listen for global events from header component
  document.addEventListener('clear-storage', clearStorage)
  document.addEventListener('revert-translation', revertTranslation)
  document.addEventListener('translate-request', (event) => {
    if (sourceText.value.trim()) {
      handleTranslate()
    }
  })
  document.addEventListener('languages-swapped', () => {
    // Could trigger re-translation if text exists
    if (sourceText.value.trim() && translatedText.value.trim()) {
      // Swap the text content too
      const temp = sourceText.value
      sourceText.value = translatedText.value.replace(/<[^>]*>/g, '')
      translatedText.value = temp
    }
  })
  
  // Initialize translation data
  await loadLastTranslation()
})
</script>

<style scoped>
.translation-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Popup-specific adjustments if needed */
.translation-form :deep(.textarea-container) {
  margin: 10px 12px;
}

.translation-form :deep(.translation-textarea) {
  min-height: 60px;
}

.translation-form :deep(.result-content) {
  min-height: 60px;
}
</style>