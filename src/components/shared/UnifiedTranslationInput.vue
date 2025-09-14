<template>
  <form @submit.prevent="handleTranslate" class="unified-translation-input" :class="[`mode-${mode}`, { 'enhanced': enhanced }]">
    
    <!-- Controls Section (Language & Provider) -->
    <div v-if="showControls" class="controls-container">
      <LanguageSelector
        v-if="showLanguageSelector"
        v-model:source-language="sourceLanguage"
        v-model:target-language="targetLanguage"
        :auto-detect-label="autoDetectLabel"
        :source-title="sourceTitle"
        :target-title="targetTitle"
        :swap-title="swapTitle"
        :swap-alt="swapAlt"
      />
      <ProviderSelector
        v-if="showProviderSelector"
        :mode="providerSelectorMode"
        :disabled="!canTranslate"
        @translate="handleTranslate"
      />
    </div>


    <!-- Enhanced Source Text Input Section -->
    <div class="enhanced-input-section">
      <label v-if="showInputLabel" class="input-label">{{ inputLabel }}:</label>
      <div class="input-container">
        <textarea
          ref="sourceInputRef"
          v-model="sourceText"
          :placeholder="inputPlaceholder"
          :rows="inputRows"
          :tabindex="1"
          class="translation-textarea enhanced"
          @input="handleSourceInput"
          @keydown="handleKeydown"
        />
        <ActionToolbar
          :text="sourceText"
          :language="currentSourceLanguage"
          :mode="toolbarMode"
          position="top-right"
          :visible="true"
          :show-copy="true"
          :show-paste="true"
          :show-tts="true"
          :copy-disabled="sourceText.length === 0"
          :tts-disabled="sourceText.length === 0"
          size="md"
          variant="secondary"
          :auto-translate-on-paste="autoTranslateOnPaste"
          :copy-title="copySourceTitle"
          :paste-title="pasteTitle"
          :tts-title="ttsSourceTitle"
          @text-copied="handleSourceTextCopied"
          @text-pasted="handleSourceTextPasted"
          @tts-speaking="handleSourceTTSSpeaking"
          @action-failed="handleActionFailed"
        />
      </div>
    </div>

    <!-- Enhanced Translation Result Section -->
    <div v-if="showResultSection" class="enhanced-result-section">
      <label v-if="showResultLabel" class="input-label">{{ resultLabel }}:</label>
      <TranslationDisplay
        :content="translatedText"
        :target-language="currentTargetLanguage"
        :is-loading="isTranslating"
        :error="translationError"
        :mode="mode"
        :placeholder="resultPlaceholder"
        :copy-title="copyResultTitle"
        :tts-title="ttsResultTitle"
        :container-class="`${mode}-result-container`"
        :content-class="`${mode}-result-content`"
        @text-copied="handleTranslationCopied"
        @tts-speaking="handleTranslationTTSSpeaking"
        @action-failed="handleActionFailed"
      />
    </div>

    <!-- Status Bar -->
    <div v-if="statusMessage" class="status-bar">
      <span :class="['status-message', statusType]">{{ statusMessage }}</span>
    </div>
  </form>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useUnifiedTranslation } from '@/features/translation/composables/useUnifiedTranslation.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { correctTextDirection } from '@/utils/text/textDetection.js'
import { AUTO_DETECT_VALUE, DEFAULT_TARGET_LANGUAGE } from '@/shared/config/constants.js'

// Components
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import ActionToolbar from '@/features/text-actions/components/ActionToolbar.vue'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'

// Logger
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'UnifiedTranslationInput')

// Props
const props = defineProps({
  // Mode - determines behavior and styling
  mode: {
    type: String,
    default: 'popup',
    validator: (value) => ['popup', 'sidepanel'].includes(value)
  },
  
  // UI Configuration
  enhanced: {
    type: Boolean,
    default: true
  },
  showControls: {
    type: Boolean,
    default: true
  },
  showLanguageSelector: {
    type: Boolean,
    default: true
  },
  showProviderSelector: {
    type: Boolean,
    default: true
  },
  showInputLabel: {
    type: Boolean,
    default: true // false for popup, true for sidepanel typically
  },
  showResultSection: {
    type: Boolean,
    default: true
  },
  showResultLabel: {
    type: Boolean,
    default: true
  },
  
  // Input Configuration
  inputRows: {
    type: Number,
    default: 2 // 2 for popup, 6 for sidepanel typically
  },
  autoTranslateOnPaste: {
    type: Boolean,
    default: true
  },
  
  // Language Props
  initialSourceLanguage: {
    type: String,
    default: 'auto'
  },
  initialTargetLanguage: {
    type: String,
    default: 'fa'
  },
  
  // Labels and Text (i18n)
  autoDetectLabel: {
    type: String,
    default: 'Auto-Detect'
  },
  sourceTitle: {
    type: String,
    default: 'Source Language'
  },
  targetTitle: {
    type: String,
    default: 'Target Language'
  },
  swapTitle: {
    type: String,
    default: 'Swap Languages'
  },
  swapAlt: {
    type: String,
    default: 'Swap'
  },
  inputLabel: {
    type: String,
    default: 'Source Text'
  },
  resultLabel: {
    type: String,
    default: 'Translation'
  },
  inputPlaceholder: {
    type: String,
    default: 'Enter text to translate...'
  },
  resultPlaceholder: {
    type: String,
    default: 'Translation will appear here...'
  },
  copySourceTitle: {
    type: String,
    default: 'Copy source text'
  },
  copyResultTitle: {
    type: String,
    default: 'Copy translation'
  },
  pasteTitle: {
    type: String,
    default: 'Paste from clipboard'
  },
  ttsSourceTitle: {
    type: String,
    default: 'Speak source text'
  },
  ttsResultTitle: {
    type: String,
    default: 'Speak translation'
  },
  
  // Custom Provider Selector Mode
  providerSelectorMode: {
    type: String,
    default: 'split'
  }
})

// Emits
const emit = defineEmits([
  'can-translate-change',
  'source-text-changed',
  'translation-completed',
  'translation-error',
  'source-text-copied',
  'source-text-pasted', 
  'source-tts-speaking',
  'translation-copied',
  'translation-tts-speaking',
  'action-failed'
])

// Stores & Composables
const settingsStore = useSettingsStore()
const translationComposable = useUnifiedTranslation(props.mode)
const { handleError } = useErrorHandler()
const { t } = useUnifiedI18n()

// Refs
const sourceInputRef = ref(null)

// State from composable
const {
  sourceText,
  translatedText,
  isTranslating,
  hasTranslation,
  canTranslate,
  translationError,
  hasError,
  triggerTranslation,
  clearTranslation,
  sourceLanguage,
  targetLanguage
} = translationComposable

// Status state
const statusMessage = ref('')
const statusType = ref('')

// Sync initial props with composable languages
watch(() => props.initialSourceLanguage, (newLang, oldLang) => {
  logger.debug(`[${props.mode}] 👁️ Source language watcher triggered:`, {
    newLang,
    oldLang,
    currentComposableValue: sourceLanguage.value,
    willUpdate: newLang && newLang !== sourceLanguage.value
  })
  if (newLang && newLang !== sourceLanguage.value) {
    logger.debug(`[${props.mode}] 🔄 Updating sourceLanguage from ${sourceLanguage.value} to ${newLang}`)
    sourceLanguage.value = newLang
  }
}, { immediate: true })

watch(() => props.initialTargetLanguage, (newLang, oldLang) => {
  logger.debug(`[${props.mode}] 👁️ Target language watcher triggered:`, {
    newLang,
    oldLang,
    currentComposableValue: targetLanguage.value,
    willUpdate: newLang && newLang !== targetLanguage.value
  })
  if (newLang && newLang !== targetLanguage.value) {
    logger.debug(`[${props.mode}] 🔄 Updating targetLanguage from ${targetLanguage.value} to ${newLang}`)
    targetLanguage.value = newLang
  }
}, { immediate: true })

// Helper function to detect if text is Persian
const isPersianText = (text) => {
  if (!text) return false
  // Persian Unicode range: \u0600-\u06FF
  const persianRegex = /[\u0600-\u06FF]/
  return persianRegex.test(text)
}

// Computed
const currentSourceLanguage = computed(() => {
  // For TTS, AUTO_DETECT_VALUE is not useful - use actual language from settings
  const langValue = sourceLanguage.value
  const initialLang = props.initialSourceLanguage

  logger.debug(`[${props.mode}] 🔍 currentSourceLanguage computed called:`, {
    sourceLanguageValue: langValue,
    initialSourceLanguage: initialLang,
    settingsSourceLanguage: settingsStore.settings.SOURCE_LANGUAGE,
    isAutoDetect: langValue === AUTO_DETECT_VALUE,
    stackTrace: new Error().stack.split('\n')[1]
  })

  // If initialSourceLanguage is explicitly set and not auto, use it
  if (initialLang && initialLang !== AUTO_DETECT_VALUE) {
    logger.debug(`[${props.mode}] Using explicit initial language:`, initialLang)
    return initialLang
  }

  // Always check for AUTO_DETECT_VALUE first
  if (!langValue || langValue === AUTO_DETECT_VALUE) {
    const fallbackLang = settingsStore.settings.SOURCE_LANGUAGE

    // If we have text, try to detect its language
    if (props.modelValue) {
      if (isPersianText(props.modelValue)) {
        logger.debug(`[${props.mode}] Detected Persian text, using 'fa'`)
        return 'fa'
      }
      // Add more language detections here if needed
    }

    logger.debug(`[${props.mode}] Using fallback language:`, { fallbackLang })
    // If settings source language is also auto, use a real language
    if (fallbackLang === AUTO_DETECT_VALUE || !fallbackLang) {
      logger.debug(`[${props.mode}] Fallback is also auto, using default: fa`)
      return 'fa' // Default to Persian for this extension
    }
    return fallbackLang
  }

  logger.debug(`[${props.mode}] Using direct language value:`, langValue)
  return langValue
})
const currentTargetLanguage = computed(() => {
  const langValue = targetLanguage.value
  const initialLang = props.initialTargetLanguage

  // If initialTargetLanguage is explicitly set, use it
  if (initialLang) {
    logger.debug(`[${props.mode}] Using explicit initial target language:`, initialLang)
    return initialLang
  }

  if (!langValue) {
    return settingsStore.settings.TARGET_LANGUAGE || 'fa'
  }
  return langValue
})

const toolbarMode = computed(() => {
  if (props.mode === 'sidepanel') return 'sidepanel'
  return 'input'
})

// Watch for can-translate changes
watch(canTranslate, (newValue) => {
  emit('can-translate-change', newValue)
})

// Watch for source text changes
watch(sourceText, (newValue) => {
  emit('source-text-changed', newValue)
})

// Watch for translation completion
watch([translatedText, hasError], ([newTranslation, hasErr]) => {
  if (hasErr) {
    emit('translation-error', translationError.value)
  } else if (newTranslation) {
    emit('translation-completed', newTranslation)
  }
})

// Methods
const handleTranslate = async () => {
  if (!canTranslate.value) return

  logger.debug(`[${props.mode}] Starting translation`, {
    sourceLength: sourceText.value?.length || 0,
    sourceLang: currentSourceLanguage.value,
    targetLang: currentTargetLanguage.value
  })

  const success = await triggerTranslation(
    currentSourceLanguage.value,
    currentTargetLanguage.value
  )
  
  if (success) {
    logger.debug(`[${props.mode}] Translation initiated successfully`)
  } else {
    logger.warn(`[${props.mode}] Translation failed to initiate`)
  }
}

const handleSourceInput = (event) => {
  const text = event.target.value
  
  // Apply text direction correction to the textarea element
  try {
    if (sourceInputRef.value) {
      correctTextDirection(sourceInputRef.value, text)
    }
  } catch (error) {
    logger.warn(`[${props.mode}] Text direction correction failed:`, error)
  }
}

const handleKeydown = (event) => {
  // Enter key behavior
  if (event.key === 'Enter') {
    if (props.mode === 'popup') {
      // In popup: Enter submits, Shift+Enter adds new line
      if (!event.shiftKey) {
        event.preventDefault()
        handleTranslate()
      }
    } else {
      // In sidepanel: Ctrl+Enter submits, Enter adds new line
      if (event.ctrlKey) {
        event.preventDefault()
        handleTranslate()
      }
    }
  }
}

// ActionToolbar Event Handlers
const handleSourceTextCopied = (text) => {
  logger.debug(`[${props.mode}] Source text copied:`, text.substring(0, 50) + '...')
  emit('source-text-copied', text)
}

const handleSourceTextPasted = (data) => {
  logger.debug(`[${props.mode}] Source text pasted:`, data.text.substring(0, 50) + '...')
  sourceText.value = data.text
  emit('source-text-pasted', data)
  
  // Auto-translate if enabled
  if (data.autoTranslate && canTranslate.value) {
    nextTick(() => {
      handleTranslate()
    })
  }
}

const handleSourceTTSSpeaking = (data) => {
  logger.debug(`[${props.mode}] Source TTS started:`, data.text.substring(0, 50) + '...')
  emit('source-tts-speaking', data)
}

const handleTranslationCopied = (text) => {
  logger.debug(`[${props.mode}] Translation copied:`, text.substring(0, 50) + '...')
  emit('translation-copied', text)
}

const handleTranslationTTSSpeaking = (data) => {
  logger.debug(`[${props.mode}] Translation TTS started:`, data.text.substring(0, 50) + '...')
  emit('translation-tts-speaking', data)
}

const handleActionFailed = (error) => {
  logger.error(`[${props.mode}] Action failed:`, error)
  const errorMessage = error?.message || error?.error || error || 'Action failed'
  emit('action-failed', error)
}

// Focus management
const focusInput = () => {
  nextTick(() => {
    if (sourceInputRef.value) {
      sourceInputRef.value.focus()
    }
  })
}

// Auto-resize for popup mode (load dynamically to avoid async setup)
let resizeComposable = null
if (props.mode === 'popup') {
  import('@/composables/ui/usePopupResize.js').then(({ usePopupResize }) => {
    if (usePopupResize) {
      resizeComposable = usePopupResize()
      // Enable auto-resize if available
    }
  }).catch(err => {
    logger.debug('Failed to load usePopupResize:', err)
  })
}

// Component lifecycle
onMounted(() => {
  logger.debug(`[${props.mode}] UnifiedTranslationInput mounted`, {
    initialSourceLanguage: props.initialSourceLanguage,
    initialTargetLanguage: props.initialTargetLanguage,
    currentSourceLanguage: sourceLanguage.value,
    currentTargetLanguage: targetLanguage.value
  })

  // Auto-focus for popup mode
  if (props.mode === 'popup') {
    focusInput()
  }
})

// Expose methods for parent components
defineExpose({
  focusInput,
  clearTranslation,
  triggerTranslation: handleTranslate,
  sourceText,
  translatedText,
  isTranslating,
  canTranslate
})
</script>

<style scoped>
/* Base Form Styles */
.unified-translation-input {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: inherit;
}

.unified-translation-input.enhanced {
  background: transparent;
}

/* Mode-specific layouts */
.unified-translation-input.mode-popup {
  padding: 0;
  gap: 12px;
}

.unified-translation-input.mode-sidepanel {
  gap: 16px;
  flex: 1;
}

/* Controls Container */
.controls-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mode-popup .controls-container {
  gap: 8px;
}


/* Enhanced Input Section */
.enhanced-input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #333);
  margin: 0;
}

.input-container {
  position: relative;
  display: flex;
  flex-direction: column;
}

/* Enhanced Textarea */
.translation-textarea.enhanced {
  width: 100%;
  min-height: 60px;
  padding: 12px 16px;
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  background-color: var(--bg-color, #ffffff);
  color: var(--text-color, #333);
  resize: vertical;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}

.translation-textarea.enhanced:focus {
  outline: none;
  border: none;
  box-shadow: none;
}

.translation-textarea.enhanced::placeholder {
  color: var(--placeholder-color, #6c757d);
  opacity: 0.7;
}

/* Mode-specific textarea styles */
.mode-popup .translation-textarea.enhanced {
  min-height: 50px;
  font-size: 13px;
  padding: 10px 14px;
}

.mode-sidepanel .translation-textarea.enhanced {
  min-height: 120px;
  font-size: 14px;
  padding: 16px;
}

/* Enhanced Result Section */
.enhanced-result-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.mode-popup .enhanced-result-section {
  flex: 1;
  min-height: 0;
}

.mode-sidepanel .enhanced-result-section {
  flex: 1;
}

/* Status Bar */
.status-bar {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
  transition: all 0.3s ease;
}

.status-message {
  font-weight: 500;
}

.status-message.success {
  color: #155724;
  background-color: #d4edda;
  border: 1px solid #c3e6cb;
}

.status-message.error {
  color: #721c24;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
}

.status-message.info {
  color: #0c5460;
  background-color: #d1ecf1;
  border: 1px solid #bee5eb;
}

.status-message.warning {
  color: #856404;
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
}

/* Dark theme support */
/* Theme-specific styles now handled by unified theme variables in _variables.scss */

.theme-dark .status-message.success {
  color: #4caf50;
  background-color: rgba(76, 175, 80, 0.1);
  border-color: rgba(76, 175, 80, 0.2);
}

.theme-dark .status-message.error {
  color: #f44336;
  background-color: rgba(244, 67, 54, 0.1);
  border-color: rgba(244, 67, 54, 0.2);
}

.theme-dark .status-message.info {
  color: #2196f3;
  background-color: rgba(33, 150, 243, 0.1);
  border-color: rgba(33, 150, 243, 0.2);
}

/* Responsive adjustments */
@media (max-width: 400px) {
  .mode-popup .translation-textarea.enhanced {
    font-size: 12px;
    min-height: 40px;
  }
  
  .mode-popup .controls-container {
    gap: 6px;
  }
}
</style>