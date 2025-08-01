<template>
  <form
    class="translation-form"
    @submit.prevent="handleSubmit"
  >
    <!-- Language Controls -->
    <LanguageSelector
      v-model:source-language="sourceLanguage"
      v-model:target-language="targetLanguage"
      :disabled="isTranslating"
      :auto-detect-label="'Auto-Detect'"
      :source-title="t('SIDEPANEL_SOURCE_LANGUAGE_TITLE', 'Source Language')"
      :target-title="t('SIDEPANEL_TARGET_LANGUAGE_TITLE', 'Target Language')"
      :swap-title="t('SIDEPANEL_SWAP_LANGUAGES_TITLE', 'Swap Languages')"
      :swap-alt="'Swap'"
      @swap-languages="handleSwapLanguages"
    />

    <!-- Source Input Field -->
    <TranslationInputField
      ref="sourceInputRef"
      v-model="sourceText"
      :placeholder="t('SIDEPANEL_SOURCE_TEXT_PLACEHOLDER', 'Enter text to translate')"
      :language="sourceLanguage"
      :rows="6"
      :tabindex="1"
      :copy-title="t('SIDEPANEL_COPY_SOURCE_TITLE_ICON', 'Copy Source Text')"
      :copy-alt="'Copy'"
      :tts-title="t('SIDEPANEL_VOICE_SOURCE_TITLE_ICON', 'Play Source Text')"
      :tts-alt="'Play'"
      :paste-title="t('SIDEPANEL_PASTE_SOURCE_TITLE_ICON', 'Paste from Clipboard')"
      :paste-alt="'Paste'"
      :auto-translate-on-paste="false"
      @translate="handleSubmit"
      @input="handleSourceTextInput"
      @keydown="handleKeydown"
    />

    <!-- Action Bar -->
    <div class="action-bar">
      <button
        type="submit"
        class="translate-button-main"
        :disabled="!canTranslate || isTranslating"
      >
        <span v-if="!isTranslating">{{ t('SIDEPANEL_TRANSLATE_BUTTON_TEXT', 'Translate') }}</span>
        <span v-else>{{ t('TRANSLATING', 'Translating...') }}</span>
        <img 
          v-if="!isTranslating"
          src="@/assets/icons/translate.png" 
          alt="Translate" 
        >
        <div
          v-else
          class="button-spinner"
        />
      </button>
    </div>
  </form>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '@/composables/useI18n.js'
import { logME } from '@/utils/helpers.js'
import { AUTO_DETECT_VALUE } from '@/constants.js'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import TranslationInputField from '@/components/shared/TranslationInputField.vue'

// Props
const props = defineProps({
  sourceText: {
    type: String,
    default: ''
  },
  sourceLanguage: {
    type: String,
    default: 'Auto-Detect'
  },
  targetLanguage: {
    type: String,
    default: 'English'
  },
  isTranslating: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits([
  'update:sourceText',
  'update:sourceLanguage', 
  'update:targetLanguage',
  'translate',
  'swap-languages'
])

// Refs
const sourceInputRef = ref(null)

// Composables
const { t } = useI18n()

// Local reactive values
const sourceText = computed({
  get: () => props.sourceText,
  set: (value) => emit('update:sourceText', value)
})

const sourceLanguage = computed({
  get: () => props.sourceLanguage,
  set: (value) => emit('update:sourceLanguage', value)
})

const targetLanguage = computed({
  get: () => props.targetLanguage,
  set: (value) => emit('update:targetLanguage', value)
})

// Computed
const hasSourceText = computed(() => sourceText.value.trim().length > 0)

const canTranslate = computed(() => {
  const hasText = hasSourceText.value
  const hasTarget = targetLanguage.value && targetLanguage.value.trim() !== ''
  const notAutoDetect = targetLanguage.value !== 'Auto-Detect' && targetLanguage.value !== AUTO_DETECT_VALUE
  const notTranslating = !props.isTranslating
  
  logME('[TranslationForm] canTranslate check:', {
    hasText,
    hasTarget,
    targetLanguage: targetLanguage.value,
    notAutoDetect,
    notTranslating,
    result: hasText && hasTarget && notAutoDetect && notTranslating
  })
  
  return hasText && hasTarget && notAutoDetect && notTranslating
})

// Event Handlers
const handleSubmit = () => {
  if (canTranslate.value) {
    logME('[TranslationForm] Form submitted for translation')
    emit('translate', {
      text: sourceText.value,
      sourceLanguage: sourceLanguage.value,
      targetLanguage: targetLanguage.value
    })
  }
}

const handleSwapLanguages = () => {
  logME('[TranslationForm] Swapping languages')
  emit('swap-languages')
}

const handleSourceTextInput = () => {
  // Handled by TranslationInputField component
}

const handleKeydown = (event) => {
  // Handled by TranslationInputField component
}
</script>

<style scoped>
.translation-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

/* Sidepanel-specific adjustments */
.translation-form :deep(.textarea-container) {
  margin: 0; /* No margin for sidepanel */
}

.translation-form :deep(.translation-textarea) {
  height: 140px;
  resize: none;
}

.action-bar {
  display: flex;
  justify-content: center;
}

.translate-button-main {
  padding: 12px 24px;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  min-width: 140px;
  justify-content: center;
}

.translate-button-main:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.translate-button-main:disabled {
  background: var(--bg-disabled);
  color: var(--text-disabled);
  cursor: not-allowed;
  transform: none;
}

.translate-button-main img {
  width: 18px;
  height: 18px;
}

.button-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>