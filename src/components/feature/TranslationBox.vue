<template>
  <div class="translation-box" :class="{ disabled }">
    <!-- Source Text Section -->
    <div class="input-section">
      <div class="language-row">
        <LanguageSelector
          v-model="fromLanguage"
          type="source"
          :languages="availableLanguages"
          :disabled="disabled"
        />
        
        <BaseButton
          variant="ghost"
          size="sm"
          icon="swap"
          title="Swap Languages"
          :disabled="disabled || fromLanguage === 'auto'"
          @click="swapLanguages"
        />
        
        <LanguageSelector
          v-model="toLanguage"
          type="target"
          :languages="availableLanguages"
          :disabled="disabled"
        />
      </div>
      
      <BaseTextarea
        v-model="sourceTextRef"
        placeholder="Enter text to translate..."
        :rows="2"
        :disabled="disabled"
        @input="handleInput"
        @paste="handlePaste"
      />
    </div>

    <!-- Translation Actions -->
    <div class="actions-section">
      <BaseButton
        variant="primary"
        :loading="isTranslating"
        :disabled="!canTranslate"
        @click="translate"
      >
        Translate
      </BaseButton>
      
      <BaseButton
        v-if="sourceText || translatedText"
        variant="ghost"
        size="sm"
        icon="clear"
        title="Clear"
        @click="clear"
      />
    </div>

    <!-- Translation Result -->
    <div v-if="translatedText || isTranslating" class="output-section">
      <BaseTextarea
        v-model="translatedText"
        placeholder="Translation will appear here..."
        :rows="3"
        readonly
        :loading="isTranslating"
      />
      
      <div v-if="translatedText" class="result-actions">
        <BaseButton
          variant="ghost"
          size="sm"
          icon="copy"
          title="Copy to Clipboard"
          @click="copyToClipboard"
        />
        
        <BaseButton
          variant="ghost"
          size="sm"
          icon="volume"
          title="Text to Speech"
          @click="playTTS"
        />
        
        <BaseButton
          variant="ghost"
          size="sm"
          icon="history"
          title="Save to History"
          @click="saveToHistory"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { refDebounced } from '@vueuse/core'
import { useSettingsStore } from '@/store/core/settings'
import { useTranslationStore } from '@/store/modules/translation'
import { useExtensionAPI } from '@/composables/useExtensionAPI'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import LanguageSelector from '@/components/feature/LanguageSelector.vue'

const props = defineProps({
  mode: {
    type: String,
    default: 'popup',
    validator: (value) => ['popup', 'sidepanel', 'options'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['translate', 'clear'])

// Stores & Composables
const settingsStore = useSettingsStore()
const translationStore = useTranslationStore()
const { sendMessage } = useExtensionAPI()

// State
const sourceTextRef = ref('')
const sourceText = refDebounced(sourceTextRef, 300)
const translatedText = ref('')
const fromLanguage = ref('auto')
const toLanguage = ref('en')
const isTranslating = ref(false)

// Mock data for now - will be replaced with real language data
const availableLanguages = ref([
  { code: 'auto', name: 'Auto Detect' },
  { code: 'en', name: 'English' },
  { code: 'fa', name: 'Persian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' }
])

// Computed
const canTranslate = computed(() => {
  return !props.disabled && 
         !isTranslating.value && 
         sourceText.value.trim().length > 0 &&
         settingsStore.canTranslate
})

// Methods
const translate = async () => {
  if (!canTranslate.value) return

  isTranslating.value = true
  translatedText.value = ''

  try {
    const result = await translationStore.translateText(sourceText.value, {
      from: fromLanguage.value,
      to: toLanguage.value,
      provider: settingsStore.selectedProvider
    })

    translatedText.value = result.text
    emit('translate', result)
  } catch (error) {
    console.error('Translation error:', error)
    translatedText.value = 'Translation failed. Please try again.'
  } finally {
    isTranslating.value = false
  }
}

const swapLanguages = () => {
  if (fromLanguage.value === 'auto') return

  // Swap language codes
  const temp = fromLanguage.value
  fromLanguage.value = toLanguage.value
  toLanguage.value = temp

  // Swap text content
  const tempText = sourceTextRef.value
  sourceTextRef.value = translatedText.value
  translatedText.value = tempText
}

const clear = () => {
  sourceTextRef.value = ''
  translatedText.value = ''
  emit('clear')
}

const handleInput = () => {
  translatedText.value = ''
}

const handlePaste = async (event) => {
  // Auto-translate on paste if enabled
  await nextTick()
  if (sourceTextRef.value.trim()) {
    setTimeout(translate, 500)
  }
}

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(translatedText.value)
    // Show success feedback
  } catch (error) {
    console.error('Failed to copy:', error)
  }
}

const playTTS = async () => {
  try {
    await sendMessage('PLAY_TTS', {
      text: translatedText.value,
      language: toLanguage.value
    })
  } catch (error) {
    console.error('TTS error:', error)
  }
}

const saveToHistory = async () => {
  try {
    await sendMessage('SAVE_TO_HISTORY', {
      sourceText: sourceTextRef.value,
      translatedText: translatedText.value,
      fromLanguage: fromLanguage.value,
      toLanguage: toLanguage.value,
      provider: settingsStore.selectedProvider
    })
  } catch (error) {
    console.error('Failed to save to history:', error)
  }
}

// Watch for settings changes
watch(() => settingsStore.sourceLanguage, (newVal) => {
  fromLanguage.value = newVal
})

watch(() => settingsStore.targetLanguage, (newVal) => {
  toLanguage.value = newVal
})

// Auto-translate on debounced input
watch(sourceText, (newText) => {
  if (newText.trim() && props.mode === 'sidepanel') {
    translate()
  }
})
</script>

<style scoped>
.translation-box {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  
  &.disabled {
    opacity: 0.6;
    pointer-events: none;
  }
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.language-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.actions-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.output-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-actions {
  display: flex;
  justify-content: center;
  gap: 4px;
}
</style>