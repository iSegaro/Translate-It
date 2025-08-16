<template>
  <div
    class="translation-display"
    :class="{
      'has-content': hasContent,
      'is-loading': isLoading,
      'has-error': hasError,
      'compact-mode': mode === 'compact',
      'popup-mode': mode === 'popup',
      'sidepanel-mode': mode === 'sidepanel',
      'selection-mode': mode === 'selection'
    }"
  >
    <!-- Enhanced Actions Toolbar -->
    <ActionToolbar
      v-if="showToolbar && hasContent"
      :text="content"
      :target-language="targetLanguage"
      :mode="mode === 'sidepanel' ? 'sidepanel' : 'output'"
      class="display-toolbar"
      :show-copy="showCopyButton"
      :show-tts="showTTSButton"
    />
    
    <!-- Loading Spinner -->
    <div
      v-if="isLoading"
      class="loading-overlay"
    >
      <div class="loading-spinner">
        <div class="spinner" />
      </div>
    </div>
    
    <!-- Content Display -->
    <div 
      ref="contentRef"
      class="translation-content"
      :class="{ 
        'fade-in': showFadeIn,
        'loading-dim': isLoading
      }"
      v-html="renderedContent"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { correctTextDirection } from '@/utils/text/textDetection.js'
import { SimpleMarkdown } from '@/utils/text/markdown.js'
import ActionToolbar from '@/components/shared/actions/ActionToolbar.vue'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

// Scoped logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationDisplay');


// Props
const props = defineProps({
  // Core content
  content: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'English'
  },
  
  // State
  isLoading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  
  // Display options
  mode: {
    type: String,
    default: 'standard', // standard, compact, popup, sidepanel, selection
    validator: (value) => ['standard', 'compact', 'popup', 'sidepanel', 'selection'].includes(value)
  },
  placeholder: {
    type: String,
    default: 'Translation will appear here...'
  },
  
  // Formatting options
  enableMarkdown: {
    type: Boolean,
    default: true
  },
  enableLabelFormatting: {
    type: Boolean,
    default: true
  },
  maxHeight: {
    type: String,
    default: null
  },
  
  // Toolbar options
  showToolbar: {
    type: Boolean,
    default: true
  },
  showCopyButton: {
    type: Boolean,
    default: true
  },
  showTTSButton: {
    type: Boolean,
    default: true
  },
  
  // Animation
  showFadeInAnimation: {
    type: Boolean,
    default: true
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
  // Target language for TTS
  targetLanguage: {
    type: String,
    default: 'auto'
  }
})

// Refs
const contentRef = ref(null)
const showFadeIn = ref(false)

// Computed
const hasContent = computed(() => props.content.trim().length > 0 && !props.isLoading)
const hasError = computed(() => !!props.error && !props.isLoading)

const renderedContent = computed(() => {
  if (props.error) {
    return `<div class="error-message">⚠️ ${props.error}</div>`
  }
  
  if (props.isLoading) {
    return `<div class="loading-message">در حال ترجمه...</div>`
  }
  
  if (!props.content) {
    return `<div class="placeholder-message">${props.placeholder}</div>`
  }
  
  if (props.enableMarkdown) {
    try {
      const markdownElement = SimpleMarkdown.render(props.content)
      return markdownElement ? markdownElement.innerHTML : props.content.replace(/\n/g, '<br>')
    } catch (error) {
  logger.warn('[TranslationDisplay] Markdown rendering failed:', error)
      return props.content.replace(/\n/g, '<br>')
    }
  } else {
    return props.content.replace(/\n/g, '<br>')
  }
})

// Watchers
watch(() => props.content, (newContent, oldContent) => {
  if (newContent && newContent !== oldContent && props.showFadeInAnimation && !props.isLoading) {
    showFadeIn.value = true
    setTimeout(() => {
      showFadeIn.value = false
    }, 400)
  }
  
  // Text direction correction
  nextTick(() => {
    if (contentRef.value && newContent) {
      correctTextDirection(contentRef.value, newContent)
    }
  })
}, { immediate: true })

watch(() => props.error, (newError) => {
  nextTick(() => {
    if (contentRef.value && newError) {
      correctTextDirection(contentRef.value, newError)
    }
  })
})

// Setup dynamic height for different modes
onMounted(() => {
  if (props.maxHeight && contentRef.value) {
    contentRef.value.style.maxHeight = props.maxHeight
  }
});
</script>

<style scoped>
/* Base container */
.translation-display {
  position: relative;
  width: 100%;
  box-sizing: border-box;
}

/* Mode-specific containers */
.translation-display.popup-mode {
  margin: 8px 12px;
  height: 100%;
  max-width: calc(100vw - 24px);
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.translation-display.sidepanel-mode {
  flex-grow: 1;
  min-height: 0;
  border: 1px solid var(--border-color, #dee2e6);
  border-radius: 5px;
  background-color: var(--bg-secondary, #ffffff);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.translation-display.selection-mode {
  width: 100%;
  max-width: 400px;
  border-radius: 8px;
  background-color: var(--sw-bg-color, #f8f8f8);
  border: 1px solid var(--sw-border-color, #ddd);
  box-shadow: 0 4px 12px var(--sw-shadow-color, rgba(0,0,0,0.1));
}

.translation-display.compact-mode {
  padding: 8px;
}

/* Content container */
.translation-content {
  width: 100%;
  padding: 32px 10px 10px 10px;
  border-radius: 3px;
  font-family: inherit;
  font-size: 14px;
  box-sizing: border-box;
  direction: ltr;
  text-align: left;
  min-height: 50px;
  background-color: var(--bg-result-color, #ffffff);
  color: var(--text-color, #212529);
  border: 1px solid var(--header-border-color, #dee2e6);
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
  overflow-wrap: break-word;
  overflow-y: auto;
  overflow-x: hidden;
  max-width: 100%;
  transition: opacity 0.3s ease-out, max-height 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
}

/* Sidepanel content adjustments */
.sidepanel-mode .translation-content {
  height: 100%;
  flex-grow: 1;
  border: none;
  border-radius: 0;
  padding: 42px 14px 12px 14px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Selection window adjustments */
.selection-mode .translation-content {
  border: none;
  border-radius: 0 0 8px 8px;
  background-color: transparent;
  padding: 12px;
  min-height: auto;
  font-size: 14px;
}

/* Popup mode specific adjustments */
.popup-mode .translation-content {
  max-width: 100%;
  height: 100%;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  font-size: 13px;
  padding: 40px 8px 8px 8px;
}

/* Content states */
.translation-content.loading-dim {
  opacity: 0.3;
}

.translation-content.fade-in {
  animation: fadeInWithSlide 0.4s cubic-bezier(0.4, 0.0, 0.2, 1);
}

/* Message styling */
.translation-content :deep(.placeholder-message) {
  color: #6c757d;
  font-style: italic;
  opacity: 0.7;
  text-align: center;
  padding: 16px;
}

.translation-content :deep(.error-message) {
  color: #dc3545;
  font-style: italic;
  padding: 8px;
  border-left: 3px solid #dc3545;
  background-color: rgba(220, 53, 69, 0.1);
  border-radius: 3px;
}

.translation-content :deep(.loading-message) {
  color: #007bff;
  font-style: italic;
  opacity: 0.8;
  text-align: center;
  padding: 16px;
  animation: pulse 1.5s ease-in-out infinite;
}

/* Markdown styling */
.translation-content :deep(h1),
.translation-content :deep(h2),
.translation-content :deep(h3) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
}

.translation-content :deep(h1) { font-size: 18px; }
.translation-content :deep(h2) { font-size: 16px; }
.translation-content :deep(h3) { font-size: 15px; }

.translation-content :deep(p) {
  margin-bottom: 8px;
}

.translation-content :deep(ul),
.translation-content :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
  padding-right: 8px;
}

.translation-content :deep(li) {
  margin-bottom: 4px;
  line-height: 1.5;
}

.translation-content :deep(code) {
  background: var(--bg-secondary, #f8f9fa);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.translation-content :deep(pre) {
  background: var(--bg-secondary, #f8f9fa);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  margin: 8px 0;
}

.translation-content :deep(blockquote) {
  border-left: 3px solid var(--accent-color, #007bff);
  padding-left: 12px;
  margin-left: 0;
  color: var(--text-secondary, #6c757d);
  font-style: italic;
}

.translation-content :deep(a) {
  color: var(--accent-color, #007bff);
  text-decoration: none;
}

.translation-content :deep(a:hover) {
  text-decoration: underline;
}

/* Enhanced Display Toolbar */
.display-toolbar {
  position: absolute;
  top: 6px;
  left: 12px;
  z-index: 10;
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(4px);
  border-radius: 6px;
  padding: 2px;
}

/* Selection mode toolbar */
.selection-mode .display-toolbar {
  top: 8px;
  left: 12px;
}

/* RTL adjustments for toolbar */
html[dir="rtl"] .display-toolbar {
  left: auto;
  right: 12px;
}

html[dir="rtl"] .selection-mode .display-toolbar {
  left: auto;
  right: 12px;
}

/* Loading overlay */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(var(--bg-result-color-rgb, 255, 255, 255), 0.8);
  border-radius: 4px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--header-border-color, #dee2e6);
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

:root.theme-dark .spinner {
  border: 3px solid var(--header-border-color, #555);
  border-top: 3px solid var(--toolbar-link-color, #58a6ff);
}

/* Enhanced Display Toolbar */
.display-toolbar {
  position: absolute;
  top: 6px;
  left: 12px;
  z-index: 10;
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(4px);
  border-radius: 6px;
  padding: 2px;
}

.sidepanel-mode .display-toolbar {
  background: rgba(0, 0, 0, 0.02);
}

.selection-mode .display-toolbar {
  left: 8px;
}

html[dir="rtl"] .display-toolbar {
  left: auto;
  right: 12px;
}

html[dir="rtl"] .sidepanel-mode .display-toolbar {
  left: auto;
  right: 18px;
}

html[dir="rtl"] .selection-mode .display-toolbar {
  left: auto;
  right: 8px;
}

/* Animations */
@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}

@keyframes fadeInWithSlide {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Custom scrollbar */
.translation-content::-webkit-scrollbar {
  width: 6px;
}

.translation-content::-webkit-scrollbar-track {
  background: transparent;
}

.translation-content::-webkit-scrollbar-thumb {
  background: var(--header-border-color);
  border-radius: 3px;
}

.translation-content::-webkit-scrollbar-thumb:hover {
  background: var(--toolbar-link-color);
}

.translation-content {
  scrollbar-width: thin;
  scrollbar-color: var(--header-border-color) transparent;
}
</style>