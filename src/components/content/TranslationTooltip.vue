<template>
  <div 
    class="translation-tooltip"
    :style="tooltipStyle"
    :class="{ visible: isVisible, loading: isLoading, error: hasError }"
  >
    <div class="tooltip-content">
      <!-- Loading state -->
      <div
        v-if="isLoading"
        class="loading-state"
      >
        <LoadingSpinner size="sm" />
        <span class="loading-text">Translating...</span>
      </div>
      
      <!-- Translation result -->
      <div
        v-else-if="translation && !hasError"
        class="translation-result"
      >
        <div class="source-section">
          <div
            class="source-text"
            :title="sourceText"
          >
            {{ truncatedSourceText }}
          </div>
          <div class="language-indicator">
            {{ fromLanguage }}
          </div>
        </div>
        
        <div class="arrow-separator">
          →
        </div>
        
        <div class="target-section">
          <div
            class="translated-text"
            :title="translation"
          >
            {{ truncatedTranslation }}
          </div>
          <div class="language-indicator">
            {{ toLanguage }}
          </div>
        </div>
        
        <!-- Action buttons -->
        <div class="tooltip-actions">
          <button
            class="action-btn copy-btn"
            title="Copy translation"
            @click="copyTranslation"
          >
            <span class="icon">📋</span>
          </button>
          
          <button
            v-if="supportsTTS"
            class="action-btn tts-btn"
            :disabled="isPlayingTTS"
            title="Play audio"
            @click="playTTS"
          >
            <span class="icon">{{ isPlayingTTS ? '⏸️' : '🔊' }}</span>
          </button>
          
          <button
            class="action-btn close-btn"
            title="Close tooltip"
            @click="close"
          >
            <span class="icon">✕</span>
          </button>
        </div>
      </div>
      
      <!-- Error state -->
      <div
        v-else-if="hasError"
        class="error-state"
      >
        <div class="error-icon">
          ⚠️
        </div>
        <div class="error-content">
          <div class="error-text">
            {{ errorMessage }}
          </div>
          <button
            class="retry-btn"
            :disabled="isLoading"
            @click="retry"
          >
            Retry
          </button>
        </div>
        <button
          class="close-btn"
          @click="close"
        >
          ✕
        </button>
      </div>
      
      <!-- Fallback state -->
      <div
        v-else
        class="fallback-state"
      >
        <div class="fallback-text">
          {{ sourceText }}
        </div>
        <button
          class="close-btn"
          @click="close"
        >
          ✕
        </button>
      </div>
    </div>
    
    <!-- Tooltip pointer -->
    <div
      class="tooltip-pointer"
      :class="pointerClass"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'

const props = defineProps({
  text: {
    type: String,
    required: true
  },
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  },
  fromLanguage: {
    type: String,
    default: 'auto'
  },
  toLanguage: {
    type: String,
    default: 'en'
  },
  provider: {
    type: String,
    default: 'google'
  },
  autoTranslate: {
    type: Boolean,
    default: true
  },
  maxWidth: {
    type: Number,
    default: 300
  },
  maxLength: {
    type: Number,
    default: 100
  }
})

const emit = defineEmits(['close', 'translate', 'copy', 'tts'])

// Reactive state
const isVisible = ref(false)
const isLoading = ref(false)
const isPlayingTTS = ref(false)
const translation = ref('')
const errorMessage = ref('')
const hasError = ref(false)
const actualPosition = ref({ ...props.position })

// Computed properties
const sourceText = computed(() => props.text)

const truncatedSourceText = computed(() => {
  if (sourceText.value.length <= props.maxLength) return sourceText.value
  return sourceText.value.substring(0, props.maxLength) + '...'
})

const truncatedTranslation = computed(() => {
  if (!translation.value) return ''
  if (translation.value.length <= props.maxLength) return translation.value
  return translation.value.substring(0, props.maxLength) + '...'
})

const supportsTTS = computed(() => {
  return 'speechSynthesis' in window && translation.value
})

const tooltipStyle = computed(() => {
  const style = {
    left: `${actualPosition.value.x}px`,
    top: `${actualPosition.value.y}px`,
    maxWidth: `${props.maxWidth}px`
  }
  
  return style
})

const pointerClass = computed(() => {
  // Simple positioning logic - can be enhanced
  return 'bottom' // For now, always point upward
})

// Methods
const translateText = async () => {
  if (!sourceText.value?.trim()) return
  
  isLoading.value = true
  hasError.value = false
  errorMessage.value = ''
  
  try {
    // Send message to background script for translation
    const response = await browser.runtime.sendMessage({
      action: 'TRANSLATE_TEXT',
      data: {
        text: sourceText.value,
        from: props.fromLanguage,
        to: props.toLanguage,
        provider: props.provider
      },
      source: 'vue-app'
    })
    
    if (response.success) {
      translation.value = response.data.text
    } else {
      throw new Error(response.error || 'Translation failed')
    }
  } catch (error) {
    console.error('Translation error:', error)
    hasError.value = true
    errorMessage.value = error.message || 'Translation failed'
  } finally {
    isLoading.value = false
  }
}

const copyTranslation = async () => {
  if (!translation.value) return
  
  try {
    await navigator.clipboard.writeText(translation.value)
    emit('copy', translation.value)
    
    // Visual feedback
    showBriefFeedback('Copied!')
  } catch (error) {
    console.error('Failed to copy:', error)
    // Fallback for older browsers
    fallbackCopy(translation.value)
  }
}

const fallbackCopy = (text) => {
  const textarea = document.createElement('textarea')
  textarea.value = text
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
  showBriefFeedback('Copied!')
}

const playTTS = async () => {
  if (!supportsTTS.value || !translation.value) return
  
  try {
    isPlayingTTS.value = true
    
    // Stop any ongoing speech
    speechSynthesis.cancel()
    
    const utterance = new SpeechSynthesisUtterance(translation.value)
    utterance.lang = props.toLanguage
    utterance.rate = 0.9
    utterance.pitch = 1
    
    utterance.onend = () => {
      isPlayingTTS.value = false
    }
    
    utterance.onerror = () => {
      isPlayingTTS.value = false
      console.error('TTS error')
    }
    
    speechSynthesis.speak(utterance)
    emit('tts', translation.value)
  } catch (error) {
    console.error('TTS error:', error)
    isPlayingTTS.value = false
  }
}

const retry = () => {
  if (!isLoading.value) {
    translateText()
  }
}

const close = () => {
  // Stop any ongoing TTS
  if (isPlayingTTS.value) {
    speechSynthesis.cancel()
    isPlayingTTS.value = false
  }
  
  emit('close')
}

const showBriefFeedback = (message) => {
  // Create temporary feedback element
  const feedback = document.createElement('div')
  feedback.textContent = message
  feedback.style.cssText = `
    position: fixed;
    top: ${actualPosition.value.y - 30}px;
    left: ${actualPosition.value.x}px;
    background: #4caf50;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 2147483648;
    pointer-events: none;
    animation: fadeInOut 1.5s ease-in-out;
  `
  
  // Add fade animation
  const style = document.createElement('style')
  style.textContent = `
    @keyframes fadeInOut {
      0%, 100% { opacity: 0; transform: translateY(5px); }
      50% { opacity: 1; transform: translateY(0); }
    }
  `
  document.head.appendChild(style)
  document.body.appendChild(feedback)
  
  setTimeout(() => {
    feedback.remove()
    style.remove()
  }, 1500)
}

const adjustPosition = () => {
  // Adjust position to keep tooltip in viewport
  const rect = { width: props.maxWidth, height: 100 } // Estimated height
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }
  
  let { x, y } = props.position
  
  // Adjust horizontal position
  if (x + rect.width > viewport.width) {
    x = viewport.width - rect.width - 10
  }
  if (x < 10) {
    x = 10
  }
  
  // Adjust vertical position
  if (y + rect.height > viewport.height) {
    y = props.position.y - rect.height - 10
  }
  if (y < 10) {
    y = 10
  }
  
  actualPosition.value = { x, y }
}

// Lifecycle
onMounted(() => {
  adjustPosition()
  isVisible.value = true
  
  if (props.autoTranslate) {
    translateText()
  }
})

onUnmounted(() => {
  if (isPlayingTTS.value) {
    speechSynthesis.cancel()
  }
})

// Handle click outside
const handleClickOutside = (event) => {
  const tooltip = event.target.closest('.translation-tooltip')
  if (!tooltip) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.translation-tooltip {
  position: fixed;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  z-index: 2147483647;
  opacity: 0;
  transform: scale(0.9) translateY(-4px);
  transition: all 0.2s ease;
  pointer-events: auto;
  max-width: 400px;
  min-width: 200px;
}

.translation-tooltip.visible {
  opacity: 1;
  transform: scale(1) translateY(0);
}

.translation-tooltip.loading {
  border-color: #2196f3;
}

.translation-tooltip.error {
  border-color: #f44336;
}

.tooltip-content {
  padding: 12px;
}

/* Loading state */
.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #666;
}

.loading-text {
  font-size: 13px;
}

/* Translation result */
.translation-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.source-section,
.target-section {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.source-text,
.translated-text {
  flex: 1;
  word-wrap: break-word;
  line-height: 1.3;
}

.source-text {
  color: #666;
  font-size: 13px;
}

.translated-text {
  color: #333;
  font-weight: 500;
}

.language-indicator {
  font-size: 10px;
  background: #f5f5f5;
  color: #666;
  padding: 2px 4px;
  border-radius: 3px;
  text-transform: uppercase;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.arrow-separator {
  text-align: center;
  color: #999;
  font-size: 12px;
  margin: 2px 0;
}

/* Action buttons */
.tooltip-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.action-btn {
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
}

.action-btn:hover {
  background: #f5f5f5;
  border-color: #bbb;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn .icon {
  font-size: 10px;
  line-height: 1;
}

.copy-btn:hover {
  background: #e8f5e8;
  border-color: #4caf50;
}

.tts-btn:hover {
  background: #e3f2fd;
  border-color: #2196f3;
}

.close-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 2px;
  color: #999;
  margin-left: auto;
}

.close-btn:hover {
  color: #666;
}

/* Error state */
.error-state {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #f44336;
}

.error-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.error-content {
  flex: 1;
}

.error-text {
  font-size: 13px;
  margin-bottom: 6px;
}

.retry-btn {
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}

.retry-btn:hover {
  background: #d32f2f;
}

.retry-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Fallback state */
.fallback-state {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #666;
}

.fallback-text {
  flex: 1;
  font-size: 13px;
}

/* Tooltip pointer */
.tooltip-pointer {
  position: absolute;
  width: 0;
  height: 0;
  border-style: solid;
}

.tooltip-pointer.bottom {
  bottom: -8px;
  left: 20px;
  border-width: 8px 8px 0 8px;
  border-color: #ffffff transparent transparent transparent;
}

.tooltip-pointer.bottom::before {
  content: '';
  position: absolute;
  top: -9px;
  left: -8px;
  border-width: 8px 8px 0 8px;
  border-style: solid;
  border-color: #e0e0e0 transparent transparent transparent;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .translation-tooltip {
    background: #2d2d2d;
    border-color: #404040;
    color: #e0e0e0;
  }
  
  .source-text {
    color: #aaa;
  }
  
  .translated-text {
    color: #e0e0e0;
  }
  
  .language-indicator {
    background: #404040;
    color: #aaa;
  }
  
  .action-btn {
    border-color: #555;
    color: #e0e0e0;
  }
  
  .action-btn:hover {
    background: #404040;
    border-color: #666;
  }
  
  .tooltip-pointer.bottom {
    border-color: #2d2d2d transparent transparent transparent;
  }
  
  .tooltip-pointer.bottom::before {
    border-color: #404040 transparent transparent transparent;
  }
}

/* Animation for small screens */
@media (max-width: 480px) {
  .translation-tooltip {
    max-width: calc(100vw - 20px);
    font-size: 13px;
  }
  
  .tooltip-actions {
    flex-wrap: wrap;
  }
}
</style>