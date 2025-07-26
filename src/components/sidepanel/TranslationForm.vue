<template>
  <form @submit.prevent="handleSubmit" class="translation-form">
    <!-- Language Controls -->
    <div class="language-controls">
      <select
        v-model="sourceLanguage"
        class="language-select"
        :title="t('SIDEPANEL_SOURCE_LANGUAGE_TITLE', 'Source Language')"
      >
        <option value="Auto-Detect">Auto-Detect</option>
        <option
          v-for="language in availableLanguages"
          :key="language.code"
          :value="language.name"
        >
          {{ language.name }}
        </option>
      </select>

      <button
        type="button"
        class="swap-button"
        :title="t('SIDEPANEL_SWAP_LANGUAGES_TITLE', 'Swap Languages')"
        :disabled="!canSwapLanguages"
        @click="handleSwapLanguages"
      >
        <img src="@/assets/icons/swap.png" alt="Swap" />
      </button>

      <select
        v-model="targetLanguage"
        class="language-select"
        :title="t('SIDEPANEL_TARGET_LANGUAGE_TITLE', 'Target Language')"
      >
        <option
          v-for="language in targetLanguages"
          :key="language.code"
          :value="language.name"
        >
          {{ language.name }}
        </option>
      </select>
    </div>

    <!-- Source Text Area with Toolbar -->
    <div class="textarea-container source-container">
      <div class="inline-toolbar source-toolbar" :class="{ 'visible': hasSourceText }">
        <img
          src="@/assets/icons/copy.png"
          class="inline-icon"
          :title="t('SIDEPANEL_COPY_SOURCE_TITLE_ICON', 'Copy Source Text')"
          @click="handleCopySource"
        />
        <img
          src="@/assets/icons/speaker.png"
          class="inline-icon"
          :title="t('SIDEPANEL_VOICE_SOURCE_TITLE_ICON', 'Play Source Text')"
          @click="handleVoiceSource"
        />
      </div>
      
      <img
        src="@/assets/icons/paste.png"
        class="inline-icon paste-icon-separate"
        :title="t('SIDEPANEL_PASTE_SOURCE_TITLE_ICON', 'Paste from Clipboard')"
        @click="handlePasteSource"
      />
      
      <textarea
        ref="sourceTextarea"
        v-model="sourceText"
        rows="6"
        :placeholder="t('SIDEPANEL_SOURCE_TEXT_PLACEHOLDER', 'Enter text to translate')"
        class="source-textarea"
        @input="handleSourceTextInput"
        @keydown="handleKeydown"
      ></textarea>
    </div>

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
        />
        <div v-else class="button-spinner"></div>
      </button>
    </div>
  </form>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useLanguages } from '@/composables/useLanguages.js'
import { useClipboard } from '@/composables/useClipboard.js'
import { useTTSSimple } from '@/composables/useTTSSimple.js'
import { useSettingsStore } from '@/store/core/settings.js'
import { useI18n } from '@/composables/useI18n.js'
import { correctTextDirection } from '@/utils/textDetection.js'
import { AUTO_DETECT_VALUE } from '@/constants.js'
import { logME } from '@/utils/helpers.js'

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
const sourceTextarea = ref(null)

// Composables
const languages = useLanguages()
const clipboard = useClipboard()
const tts = useTTSSimple()
const settingsStore = useSettingsStore()
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
const availableLanguages = computed(() => languages.allLanguages.value || [])

const targetLanguages = computed(() => {
  // فیلتر کردن Auto-Detect از لیست زبان‌های مقصد
  return (languages.allLanguages.value || []).filter(lang => 
    lang.code !== AUTO_DETECT_VALUE && lang.code !== 'auto'
  )
})

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

const canSwapLanguages = computed(() => {
  return sourceLanguage.value !== 'Auto-Detect' && 
         sourceLanguage.value !== AUTO_DETECT_VALUE && 
         targetLanguage.value !== 'Auto-Detect' && 
         targetLanguage.value !== AUTO_DETECT_VALUE
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
  if (canSwapLanguages.value) {
    logME('[TranslationForm] Swapping languages')
    emit('swap-languages')
  }
}

const handleSourceTextInput = () => {
  // اصلاح جهت متن در صورت نیاز
  nextTick(() => {
    if (sourceTextarea.value) {
      correctTextDirection(sourceTextarea.value, sourceText.value)
    }
  })
}

const handleKeydown = (event) => {
  const isModifierPressed = event.ctrlKey || event.metaKey
  const isEnterKey = event.key === 'Enter'
  const isSlashKey = event.key === '/'
  
  if (isModifierPressed && (isEnterKey || isSlashKey)) {
    event.preventDefault()
    handleSubmit()
  }
}

const handleCopySource = async () => {
  if (hasSourceText.value) {
    const success = await clipboard.copyToClipboard(sourceText.value)
    if (success) {
      logME('[TranslationForm] Source text copied to clipboard')
    }
  }
}

const handleVoiceSource = () => {
  if (hasSourceText.value) {
    logME('[TranslationForm] Playing source text with TTS')
    tts.speak(sourceText.value, sourceLanguage.value)
  }
}

const handlePasteSource = async () => {
  const pastedText = await clipboard.pasteFromClipboard()
  if (pastedText) {
    sourceText.value = pastedText
    handleSourceTextInput()
    logME('[TranslationForm] Text pasted from clipboard')
  }
}

// Initialize languages
onMounted(async () => {
  await languages.loadLanguages()
  
  // تنظیم زبان پیش‌فرض از settings
  try {
    await settingsStore.loadSettings()
    const settings = settingsStore.settings
    
    if (!props.sourceLanguage) {
      sourceLanguage.value = AUTO_DETECT_VALUE
    }
    
    if (!props.targetLanguage) {
      const targetLangDisplay = languages.getLanguageDisplayValue(settings.TARGET_LANGUAGE)
      targetLanguage.value = targetLangDisplay || 'English'
    }
  } catch (error) {
    console.error('[TranslationForm] Failed to load language settings:', error)
  }
})
</script>

<style scoped>
.translation-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.language-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.language-select {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
}

.language-select:focus {
  outline: none;
  border-color: var(--accent-color);
}

.swap-button {
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}

.swap-button:hover:not(:disabled) {
  background: var(--bg-hover);
}

.swap-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.swap-button img {
  width: 16px;
  height: 16px;
}

.textarea-container {
  position: relative;
}

.inline-toolbar {
  position: absolute;
  top: 5px;
  left: 18px;
  display: none;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.inline-toolbar.visible {
  display: flex;
}

.inline-icon {
  width: 16px;
  height: 16px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s ease, filter 0.2s ease;
  filter: var(--icon-filter);
}

.inline-icon:hover {
  opacity: 1;
}

.paste-icon-separate {
  position: absolute;
  top: 5px;
  right: 8px;
  display: none;
  z-index: 10;
}

.source-textarea {
  width: 100%;
  height: 140px;
  resize: none;
  box-sizing: border-box;
  padding-top: 32px;
  padding-bottom: 12px;
  padding-inline-start: 14px;
  padding-inline-end: 14px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background-color: var(--bg-secondary);
  color: var(--text-color);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.7;
  direction: ltr;
  text-align: left;
  min-width: 0;
}

.source-textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

.source-textarea::placeholder {
  color: var(--text-secondary);
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