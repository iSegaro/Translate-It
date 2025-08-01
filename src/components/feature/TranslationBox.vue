<template>
  <div
    class="translation-box"
    :class="{ disabled }"
  >
    <!-- Source Text Section -->
    <div class="input-section">
      <div class="language-row">
        <LanguageSelector
          v-model="fromLanguage"
          type="source"
          :languages="sourceLanguages"
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
          :languages="targetLanguages"
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
    <div
      v-if="translatedText || isTranslating"
      class="output-section"
    >
      <BaseTextarea
        v-model="translatedText"
        placeholder="Translation will appear here..."
        :rows="3"
        readonly
        :loading="isTranslating"
      />
      
      <div
        v-if="translatedText"
        class="result-actions"
      >
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
import { useLanguages } from '@/composables/useLanguages.js'
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
const { sourceLanguages, targetLanguages } = useLanguages()

// State
const sourceTextRef = ref('')
const sourceText = refDebounced(sourceTextRef, 300)
const translatedText = ref('')
const fromLanguage = ref('auto')
const toLanguage = ref('en')
const isTranslating = ref(false)

// Available languages based on context
const handleInput = () => {
  translatedText.value = ''
}

const handlePaste = async (_event) => {
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
  } catch (_error) {
    console.error('Failed to copy:', _error)
  }
}

const playTTS = async () => {
  try {
    await sendMessage('PLAY_TTS', {
      text: translatedText.value,
      language: toLanguage.value
    })
  } catch (_error) {
    console.error('TTS error:', _error)
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
  } catch (_error) {
    console.error('Failed to save to history:', _error)
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