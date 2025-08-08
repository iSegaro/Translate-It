<template>
  <div
    class="textarea-container result-container"
    :class="{ 'has-content': hasContent }"
  >
    <!-- Inline Toolbar (copy, tts) -->
    <div
      class="inline-toolbar"
      :class="{ 'visible': hasContent }"
    >
      <IconButton
        icon="copy.png"
        :title="copyTitle"
        :alt="copyAlt"
        type="inline"
        @click="handleCopy"
      />
      <IconButton
        icon="speaker.png"
        :title="ttsTitle"
        :alt="ttsAlt"
        type="inline"
        @click="handleTTS"
      />
    </div>
    
    <!-- Loading Spinner (overlaid when loading) -->
    <div
      v-if="isLoading"
      class="spinner-overlay"
    >
      <div class="spinner-center">
        <div class="spinner" />
      </div>
    </div>
    
    <!-- Result Content (always present) -->
    <div 
      ref="resultRef"
      class="result-content"
      :class="{ 'has-error': hasError, 'fade-in': showFadeIn, 'loading-fade': isLoading }"
      v-html="renderedContent"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useClipboard } from '@/composables/useClipboard.js'
import { useTTSSimple } from '@/composables/useTTSSimple.js'
import { getLanguageCodeForTTS } from '@/utils/i18n/languages.js'
import { correctTextDirection } from '@/utils/text/textDetection.js'
import { SimpleMarkdown } from '@/utils/text/markdown.js'
import IconButton from '@/components/shared/IconButton.vue'

// Props
const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'English'
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Translation will appear here...'
  },
  // i18n titles
  copyTitle: {
    type: String,
    default: 'Copy result'
  },
  copyAlt: {
    type: String,
    default: 'Copy'
  },
  ttsTitle: {
    type: String,
    default: 'Play result'
  },
  ttsAlt: {
    type: String,
    default: 'Play'
  },
  // Formatting options
  enableMarkdown: {
    type: Boolean,
    default: true
  },
  showFadeInAnimation: {
    type: Boolean,
    default: true
  }
})

// Refs
const resultRef = ref(null)
const showFadeIn = ref(false)

// Composables
const clipboard = useClipboard()
const tts = useTTSSimple()

// Computed
const hasContent = computed(() => props.content.trim().length > 0 && !props.isLoading)

const hasError = computed(() => !!props.error && !props.isLoading)

const renderedContent = computed(() => {
  if (props.error) {
    return `<div class="error-text">⚠️ ${props.error}</div>`
  }
  
  if (props.isLoading) {
    return '<div class="loading-text">در حال ترجمه...</div>'
  }
  
  if (!props.content) {
    return `<div class="placeholder-text">${props.placeholder}</div>`
  }
  
  if (props.enableMarkdown) {
    try {
      // رندر markdown با امنیت
      const markdownElement = SimpleMarkdown.render(props.content)
      return markdownElement ? markdownElement.innerHTML : props.content.replace(/\n/g, '<br>')
    } catch (error) {
      console.warn('[TranslationOutputField] Markdown rendering failed:', error)
      return props.content.replace(/\n/g, '<br>')
    }
  } else {
    // Simple text formatting for popup
    return props.content.replace(/\n/g, '<br>')
  }
})

// Methods
const handleCopy = async () => {
  if (!hasContent.value) return
  
  try {
    // Copy original markdown content if available
    const textToCopy = resultRef.value?.dataset?.originalMarkdown || props.content
    const success = await clipboard.copyToClipboard(textToCopy)
    if (success) {
      console.log('[TranslationOutputField] Result copied to clipboard')
    }
  } catch (error) {
    console.error('[TranslationOutputField] Failed to copy result:', error)
  }
}

const handleTTS = async () => {
  if (!hasContent.value) return
  
  try {
    // Strip HTML tags for TTS
    const textForTTS = props.content.replace(/<[^>]*>/g, '')
    const langCode = getLanguageCodeForTTS(props.language)
    await tts.speak(textForTTS, langCode)
    console.log('[TranslationOutputField] Playing TTS for result')
  } catch (error) {
    console.error('[TranslationOutputField] Failed to play TTS:', error)
  }
}

// Watchers
watch(() => props.content, (newContent, oldContent) => {
  // Only trigger fade-in if content actually changed and we're not loading
  if (newContent && newContent !== oldContent && props.showFadeInAnimation && !props.isLoading) {
    showFadeIn.value = true
    setTimeout(() => {
      showFadeIn.value = false
    }, 400)
  }
  
  // Text direction correction
  nextTick(() => {
    if (resultRef.value && newContent) {
      correctTextDirection(resultRef.value, newContent)
    }
  })
}, { immediate: true })

watch(() => props.error, (newError) => {
  // Text direction correction for error
  nextTick(() => {
    if (resultRef.value && newError) {
      correctTextDirection(resultRef.value, newError)
    }
  })
})
</script>

<style scoped>
.textarea-container {
  position: relative;
  margin: 10px 12px;
}

.result-container {
  min-height: 60px;
}

.result-content {
  width: 100%;
  padding: 28px 12px 12px 12px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 15px;
  box-sizing: border-box;
  direction: ltr;
  text-align: left;
  min-height: 60px;
  height: auto; /* Allow natural height expansion */
  background-color: var(--bg-result-color);
  color: var(--text-color);
  border: 1px solid var(--header-border-color);
  line-height: 1.6;
  white-space: normal !important;
  word-wrap: break-word;
  word-break: break-word; /* Better word breaking */
  overflow-wrap: break-word; /* Additional word wrap support */
  overflow-y: visible; /* Let content show naturally */
  transition: max-height 0.3s cubic-bezier(0.4, 0.0, 0.2, 1) !important;
  
  /* Custom scrollbar for better UX */
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--header-border-color);
    border-radius: 3px;
    
    &:hover {
      background: var(--toolbar-link-color);
    }
  }
  
  /* Firefox scrollbar */
  scrollbar-width: thin;
  scrollbar-color: var(--header-border-color) transparent;
}

.result-content.has-error {
  border-color: var(--error-color, #dc3545);
  background-color: var(--bg-error-subtle, rgba(220, 53, 69, 0.1));
}

.result-content.loading-fade {
  opacity: 0.3;
  transition: opacity 0.3s ease-out;
}

/* Content Styling */
.result-content :deep(.placeholder-text) {
  color: #6c757d;
  font-style: italic;
  opacity: 0.7;
}

.result-content :deep(.error-text) {
  color: #dc3545;
  font-style: italic;
  padding: 8px;
  border-left: 3px solid #dc3545;
  background-color: rgba(220, 53, 69, 0.1);
  border-radius: 3px;
}

.result-content :deep(.loading-text) {
  color: #007bff;
  font-style: italic;
  opacity: 0.8;
  text-align: center;
  padding: 16px;
  animation: pulse 1.5s ease-in-out infinite;
}

/* Markdown Styling */
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
  background: var(--bg-secondary, #f8f9fa);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.result-content :deep(pre) {
  background: var(--bg-secondary, #f8f9fa);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  margin: 8px 0;
}

.result-content :deep(blockquote) {
  border-left: 3px solid var(--accent-color, #007bff);
  padding-left: 12px;
  margin-left: 0;
  color: var(--text-secondary, #6c757d);
  font-style: italic;
}

.result-content :deep(a) {
  color: var(--accent-color, #007bff);
  text-decoration: none;
}

.result-content :deep(a:hover) {
  text-decoration: underline;
}

/* Inline Toolbar */
.inline-toolbar {
  position: absolute;
  top: 5px;
  left: 8px;
  display: none;
  align-items: center;
  gap: 10px;
  background: transparent;
  z-index: 10;
  padding: 2px;
  direction: ltr; /* Force LTR to maintain consistent positioning */
}

.textarea-container.has-content .inline-toolbar {
  display: flex;
}

.inline-toolbar.visible {
  display: flex;
}

/* Loading Spinner */
.spinner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(var(--bg-result-color-rgb, 255, 255, 255), 0.8);
  border-radius: 4px;
  z-index: 10;
}

.spinner-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--header-border-color, #dee2e6);
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin: auto;
}

:root.theme-dark .spinner {
  border: 3px solid var(--header-border-color, #555);
  border-top: 3px solid var(--toolbar-link-color, #58a6ff);
}

/* Animations */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}

.result-content.fade-in {
  animation: fadeInWithResize 0.4s cubic-bezier(0.4, 0.0, 0.2, 1);
}

@keyframes fadeInWithResize {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>