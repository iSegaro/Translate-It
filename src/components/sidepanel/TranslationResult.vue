<template>
  <div class="result-container">
    <!-- Result Area with Toolbar -->
    <div class="textarea-container result-container" :class="{ 'has-content': hasResult }">
      <div class="inline-toolbar target-toolbar" :class="{ 'visible': hasResult }">
        <img
          src="@/assets/icons/copy.png"
          class="inline-icon"
          :title="t('SIDEPANEL_COPY_TARGET_TITLE_ICON', 'Copy Translation')"
          @click="handleCopyResult"
        />
        <img
          src="@/assets/icons/speaker.png"
          class="inline-icon"
          :title="t('SIDEPANEL_VOICE_TARGET_TITLE_ICON', 'Play Translation')"
          @click="handleVoiceResult"
        />
      </div>
      
      <div 
        ref="resultElement"
        class="result" 
        :class="{ 'has-content': hasResult, 'error': hasError }"
      >
        <!-- Loading Spinner -->
        <div v-if="isLoading" class="spinner-center">
          <div class="spinner"></div>
        </div>
        
        <!-- Error Message -->
        <div v-else-if="hasError" class="error-message">
          {{ error }}
        </div>
        
        <!-- Translation Result -->
        <div 
          v-else-if="hasResult" 
          class="result-content"
          v-html="renderedResult"
        ></div>
        
        <!-- Empty State -->
        <div v-else class="empty-state">
          <span class="empty-message">{{ t('SIDEPANEL_RESULT_PLACEHOLDER', 'Translation will appear here...') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useClipboard } from '@/composables/useClipboard.js'
import { useTTSSimple } from '@/composables/useTTSSimple.js'
import { useI18n } from '@/composables/useI18n.js'
import { SimpleMarkdown } from '@/utils/simpleMarkdown.js'
import { correctTextDirection } from '@/utils/textDetection.js'
import { getLanguageCodeForTTS } from '@/utils/languages.js'
import { logME } from '@/utils/helpers.js'

// Props
const props = defineProps({
  result: {
    type: Object,
    default: null
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  targetLanguage: {
    type: String,
    default: 'English'
  }
})

// Refs
const resultElement = ref(null)

// Composables
const clipboard = useClipboard()
const tts = useTTSSimple()
const { t } = useI18n()

// Computed
const hasResult = computed(() => {
  return props.result?.success && 
         props.result?.data?.translatedText && 
         !props.isLoading && 
         !props.error
})

const hasError = computed(() => {
  return !!props.error && !props.isLoading
})

const translatedText = computed(() => {
  return props.result?.data?.translatedText || ''
})

const renderedResult = computed(() => {
  if (!translatedText.value) return ''
  
  try {
    // رندر markdown با امنیت
    const markdownElement = SimpleMarkdown.render(translatedText.value)
    return markdownElement ? markdownElement.innerHTML : translatedText.value
  } catch (error) {
    logME('[TranslationResult] Markdown rendering failed:', error)
    return translatedText.value
  }
})

// Event Handlers
const handleCopyResult = async () => {
  if (!hasResult.value) return
  
  // استفاده از markdown اصلی برای کپی
  const textToCopy = translatedText.value
  const success = await clipboard.copyToClipboard(textToCopy)
  
  if (success) {
    logME('[TranslationResult] Result copied to clipboard')
    // اختیاری: نمایش feedback
  }
}

const handleVoiceResult = () => {
  if (!hasResult.value) return
  
  logME('[TranslationResult] Playing result with TTS')
  tts.speak(translatedText.value, getLanguageCodeForTTS(props.targetLanguage))
}

// Watchers
watch([() => props.result, () => props.error], () => {
  // اصلاح جهت متن در صورت تغییر نتیجه
  nextTick(() => {
    if (resultElement.value) {
      const textContent = translatedText.value || props.error
      if (textContent) {
        correctTextDirection(resultElement.value, textContent)
      }
    }
  })
}, { immediate: true })

// اصلاح جهت متن بعد از mount
import { onMounted } from 'vue'
onMounted(() => {
  nextTick(() => {
    if (resultElement.value && (translatedText.value || props.error)) {
      const textContent = translatedText.value || props.error
      correctTextDirection(resultElement.value, textContent)
    }
  })
})
</script>

<style scoped>
.result-container {
  flex-grow: 1;
  min-height: 0;
  position: relative;
}

.textarea-container {
  position: relative;
}

.textarea-container.result-container {
  flex-grow: 1;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background-color: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
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

.result {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding-top: 32px;
  padding-bottom: 12px;
  padding-inline-start: 14px;
  padding-inline-end: 14px;
  color: var(--text-color);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.7;
  direction: ltr;
  text-align: left;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  min-width: 0;
}

.result.has-content {
  border-color: var(--success-color);
  background: var(--bg-success-subtle);
}

.result.error {
  border-color: var(--error-color);
  background: var(--bg-error-subtle);
  color: var(--error-color);
}

.spinner-center {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border-color);
  border-top: 3px solid var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-message {
  color: var(--error-color);
  text-align: center;
  padding: 20px;
  font-style: italic;
}

.result-content {
  opacity: 0;
  animation: fadeIn 0.3s ease forwards;
}

.result-content :deep(h1),
.result-content :deep(h2),
.result-content :deep(h3) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
}

.result-content :deep(h1) {
  font-size: 18px;
}

.result-content :deep(h2) {
  font-size: 16px;
}

.result-content :deep(h3) {
  font-size: 15px;
}

.result-content :deep(p) {
  margin-bottom: 8px;
}

.result-content :deep(code) {
  background: var(--bg-secondary);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.result-content :deep(pre) {
  background: var(--bg-secondary);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  margin: 8px 0;
}

.result-content :deep(blockquote) {
  border-left: 3px solid var(--accent-color);
  padding-left: 12px;
  margin-left: 0;
  color: var(--text-secondary);
  font-style: italic;
}

.result-content :deep(a) {
  color: var(--accent-color);
  text-decoration: none;
}

.result-content :deep(a:hover) {
  text-decoration: underline;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100px;
  color: var(--text-secondary);
  font-style: italic;
}

.fade-in {
  animation: fadeIn 0.3s ease forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>