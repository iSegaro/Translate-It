<template>
  <form
    class="translation-form enhanced"
    @submit.prevent="handleTranslate"
  >
    <!-- Enhanced Source Input Field -->
    <div class="enhanced-input-section">
      <div class="input-container">
        <textarea
          ref="sourceInputRef"
          v-model="sourceText"
          :placeholder="t('popup_source_text_placeholder') || 'متن را اینجا وارد کنید...'"
          :rows="2"
          :tabindex="1"
          class="translation-textarea enhanced"
          @input="handleSourceInput"
          @keydown="handleKeydown"
        />
        <ActionToolbar
          :text="sourceText"
          :language="currentSourceLanguage"
          mode="input"
          position="top-right"
          :visible="true"
          :show-copy="true"
          :show-paste="true"
          :show-tts="true"
          :copy-disabled="sourceText.length === 0"
          :tts-disabled="sourceText.length === 0"
          size="md"
          variant="secondary"
          :auto-translate-on-paste="settingsStore.settings.AUTO_TRANSLATE_ON_PASTE"
          :copy-title="t('popup_copy_source_title_icon') || 'کپی متن مبدا'"
          :paste-title="t('popup_paste_source_title_icon') || 'چسباندن'"
          :tts-title="t('popup_voice_source_title_icon') || 'خواندن متن مبدا'"
          @text-copied="handleSourceTextCopied"
          @text-pasted="handleSourceTextPasted"
          @tts-speaking="handleSourceTTSSpeaking"
          @action-failed="handleActionFailed"
        />
      </div>
    </div>

    <!-- Enhanced Translation Display -->
    <div class="enhanced-result-section">
      <div class="result-container">
        <!-- Loading State -->
        <div
          v-if="isTranslating"
          class="loading-overlay"
        >
          <div class="loading-spinner">
            <div class="spinner" />
          </div>
          <span class="loading-text">{{ t('TRANSLATING') || 'در حال ترجمه...' }}</span>
        </div>
        
        <!-- Error State -->
        <div
          v-else-if="translationError"
          class="error-content"
        >
          <div class="error-icon">
            ⚠️
          </div>
          <div class="error-text">
            {{ translationError }}
          </div>
        </div>
        
        <!-- Translation Result -->
        <div
          v-else
          ref="translationResultRef"
          class="result-content"
          :class="{ 'fade-in': showFadeInAnimation }"
          v-html="formattedTranslation"
        />
        
        <!-- Action Toolbar for Result -->
        <ActionToolbar
          v-if="hasTranslation && !isTranslating"
          :text="translatedText"
          :language="currentTargetLanguage"
          mode="output"
          position="top-right"
          :visible="true"
          :show-copy="true"
          :show-paste="false"
          :show-tts="true"
          :copy-disabled="translatedText.length === 0"
          :tts-disabled="translatedText.length === 0"
          size="md"
          variant="secondary"
          :copy-title="t('popup_copy_target_title_icon') || 'کپی نتیجه ترجمه'"
          :tts-title="t('popup_voice_target_title_icon') || 'خواندن نتیجه ترجمه'"
          @text-copied="handleTranslationCopied"
          @tts-speaking="handleTranslationTTSSpeaking"
          @action-failed="handleActionFailed"
        />
      </div>
    </div>

    <!-- Status Bar -->
    <div
      v-if="statusMessage"
      class="status-bar"
    >
      <span :class="['status-message', statusType]">{{ statusMessage }}</span>
    </div>
  </form>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { usePopupTranslation } from '@/composables/usePopupTranslation.js'
import { usePopupResize } from '@/composables/usePopupResize.js'
import { useSettingsStore } from '@/store/core/settings'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/useUnifiedI18n.js'
import ActionToolbar from '@/components/shared/actions/ActionToolbar.vue'
import { marked } from 'marked'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'EnhancedTranslationForm')

// Props & Emits
const emit = defineEmits(['can-translate-change'])

// Stores & Composables
const settingsStore = useSettingsStore()
const translationComposable = usePopupTranslation()
const resizeComposable = usePopupResize()
const { handleError } = useErrorHandler()
const { t } = useUnifiedI18n()

// Refs
const sourceInputRef = ref(null)
const translationResultRef = ref(null)

// State
const showFadeInAnimation = ref(false)
const statusMessage = ref("")
const statusType = ref("info")
const lastTranslation = ref(null)

// Destructure translation composable
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
} = translationComposable

// Computed
const currentSourceLanguage = computed(() => settingsStore.settings.SOURCE_LANGUAGE)
const currentTargetLanguage = computed(() => settingsStore.settings.TARGET_LANGUAGE)

const formattedTranslation = computed(() => {
  if (!translatedText.value) {
    return '<div class="placeholder">نتیجه ترجمه اینجا نمایش داده می‌شود...</div>'
  }
  
  try {
    return marked.parse(translatedText.value)
  } catch (error) {
    logger.error("[EnhancedTranslationForm] Markdown parsing failed:", error)
    return translatedText.value
  }
})

// Watch canTranslate and emit changes
watch(canTranslate, (newValue) => {
  emit('can-translate-change', newValue)
}, { immediate: true })

// Event Handlers
const handleSourceInput = (event) => {
  logger.debug("[EnhancedTranslationForm] Source text changed:", event.target.value.substring(0, 30) + "...")
}

const handleKeydown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    handleTranslate()
  }
}

const handleTranslate = async () => {
  if (!canTranslate.value) return
  
  try {
    logger.debug("[EnhancedTranslationForm] Starting translation")
    const sourceLanguage = settingsStore.settings.SOURCE_LANGUAGE
    const targetLanguage = settingsStore.settings.TARGET_LANGUAGE
    
    lastTranslation.value = {
      source: sourceText.value,
      target: translatedText.value,
      sourceLanguage,
      targetLanguage
    }
    
    await triggerTranslation(sourceLanguage, targetLanguage)
    
    showFadeInAnimation.value = true
    setTimeout(() => {
      showFadeInAnimation.value = false
    }, 600)
    
    showStatus("Translation completed!", "success", 2000)
  } catch (error) {
    logger.error("[EnhancedTranslationForm] Translation failed:", error)
    await handleError(error, "enhanced-popup-translation")
    showStatus("Translation failed", "error", 3000)
  }
}

// Action Handlers
const handleSourceTextCopied = () => {
  logger.debug("[EnhancedTranslationForm] Source text copied")
  showStatus("Source text copied to clipboard!", "success", 2000)
}

const handleSourceTextPasted = (event) => {
  logger.debug("[EnhancedTranslationForm] Text pasted:", event.text.substring(0, 30) + "...")
  sourceText.value = event.text
  showStatus("Text pasted from clipboard!", "success", 2000)
  
  // Auto-resize textarea
  nextTick(() => {
    if (sourceInputRef.value) {
      sourceInputRef.value.style.height = "auto"
      sourceInputRef.value.style.height = sourceInputRef.value.scrollHeight + "px"
    }
  })
  
  // Auto-translate if enabled
  if (event.autoTranslate) {
    nextTick(() => {
      handleTranslate()
    })
  }
}

const handleSourceTTSSpeaking = () => {
  logger.debug("[EnhancedTranslationForm] Playing source TTS")
  showStatus("Playing source text...", "info", 0)
}

const handleTranslationCopied = () => {
  logger.debug("[EnhancedTranslationForm] Translation copied")
  showStatus("Translation copied to clipboard!", "success", 2000)
}

const handleTranslationTTSSpeaking = () => {
  logger.debug("[EnhancedTranslationForm] Playing translation TTS")
  showStatus("Playing translation...", "info", 0)
}

const handleActionFailed = (event) => {
  logger.error("[EnhancedTranslationForm] Action failed:", event)
  showStatus(`${event.action} failed: ${event.error.message}`, "error", 3000)
}

// Status Management
const showStatus = (message, type = "info", duration = 2000) => {
  statusMessage.value = message
  statusType.value = type
  
  if (duration > 0) {
    setTimeout(() => {
      statusMessage.value = ""
    }, duration)
  }
}

// Clear functionality
const clearAll = () => {
  clearTranslation()
  lastTranslation.value = null
  statusMessage.value = ""
}

// Revert functionality
const revertTranslation = () => {
  if (lastTranslation.value) {
    sourceText.value = lastTranslation.value.target || ""
    translatedText.value = lastTranslation.value.source || ""
    
    const sourceLanguage = lastTranslation.value.targetLanguage
    const targetLanguage = lastTranslation.value.sourceLanguage
    
    if (sourceLanguage && targetLanguage) {
      settingsStore.updateSettingAndPersist('SOURCE_LANGUAGE', sourceLanguage)
      settingsStore.updateSettingAndPersist('TARGET_LANGUAGE', targetLanguage)
    }
  }
}

// Lifecycle
onMounted(async () => {
  logger.debug("[EnhancedTranslationForm] Component mounted")
  
  // Event listeners for external actions
  document.addEventListener('clear-storage', clearAll)
  document.addEventListener('revert-translation', revertTranslation)
  document.addEventListener('translate-request', (_event) => {
    if (sourceText.value.trim()) {
      handleTranslate()
    }
  })
  document.addEventListener('languages-swapped', () => {
    // Handle language swap if needed
  })
  
  // Load last translation
  await loadLastTranslation()
  
  // Auto-resize textarea if there's content
  if (sourceText.value && sourceInputRef.value) {
    nextTick(() => {
      sourceInputRef.value.style.height = "auto"
      sourceInputRef.value.style.height = sourceInputRef.value.scrollHeight + "px"
    })
  }
})

// Watch for translation result changes to trigger resize and animations
watch(translatedText, (newValue, oldValue) => {
  if (newValue && newValue !== oldValue) {
    nextTick(() => {
      const resultElement = translationResultRef.value
      if (resultElement) {
        resizeComposable.handleTranslationResult(resultElement)
        showFadeInAnimation.value = true
        setTimeout(() => {
          showFadeInAnimation.value = false
        }, 600)
      }
    })
  } else if (!newValue && oldValue) {
    const resultElement = translationResultRef.value
    if (resultElement) {
      resizeComposable.resetOutputField(resultElement)
    }
  }
})

watch(isTranslating, (newValue, oldValue) => {
  if (newValue && !oldValue) {
    resizeComposable.resetLayout()
  }
})

// Expose methods for external use
defineExpose({
  handleTranslate,
  clearAll,
  showStatus
})
</script>

<style scoped>
.translation-form.enhanced {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.enhanced-input-section,
.enhanced-result-section {
  position: relative;
}

.input-container {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
  transition: border-color 0.2s ease;
}

.input-container:focus-within {
  border-color: var(--color-primary);
}

.translation-textarea.enhanced {
  width: 100%;
  min-height: 60px;
  padding: 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-primary);
  resize: vertical;
  font-family: inherit;
  outline: none;
}

.translation-textarea.enhanced::placeholder {
  color: var(--color-text-placeholder);
}

.result-container {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-primary);
  transition: border-color 0.2s ease;
}

.result-content {
  min-height: 80px;
  padding: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-primary);
  border-radius: 8px;
}

.result-content.fade-in {
  animation: fadeIn 0.6s ease-out;
}

.placeholder {
  color: var(--color-text-placeholder);
  font-style: italic;
}

.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
}

.loading-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top: 2px solid var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.error-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  color: var(--color-error);
}

.error-icon {
  font-size: 1.2rem;
}

.error-text {
  flex: 1;
  font-size: 14px;
}

.status-bar {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}

.status-message {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);
}

.status-message.success {
  background: var(--color-success-bg);
  border-color: var(--color-success);
  color: var(--color-success);
}

.status-message.error {
  background: var(--color-error-bg);
  border-color: var(--color-error);
  color: var(--color-error);
}

.status-message.info {
  background: var(--color-info-bg);
  border-color: var(--color-info);
  color: var(--color-info);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Responsive adjustments */
@media (max-width: 400px) {
  .input-container,
  .result-container {
    border-radius: 6px;
  }
  
  .translation-textarea.enhanced {
    padding: 10px;
    font-size: 13px;
  }
  
  .result-content {
    padding: 10px;
    font-size: 13px;
  }
}
</style>
