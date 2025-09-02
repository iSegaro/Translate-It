<template>
  <div
    ref="containerRef"
    class="translation-display"
    :class="[
      {
        'has-content': hasContent,
        'is-loading': isLoading,
        'has-error': hasError,
        'compact-mode': mode === 'compact',
        'popup-mode': mode === 'popup',
        'sidepanel-mode': mode === 'sidepanel',
        'selection-mode': mode === 'selection'
      },
      containerClass
    ]"
  >
    <!-- Enhanced Actions Toolbar -->
    <ActionToolbar
      v-show="showToolbar && hasContent"
      :text="content"
      :language="targetLanguage"
      :mode="mode === 'sidepanel' ? 'sidepanel' : 'output'"
      class="display-toolbar"
      :show-copy="showCopyButton"
      :show-paste="false"
      :show-tts="showTTSButton"
      :copy-title="copyTitle"
      :tts-title="ttsTitle"
      @text-copied="handleTextCopied"
      @tts-started="handleTTSStarted"
      @tts-stopped="handleTTSStopped"
      @tts-speaking="handleTTSSpeaking"
      @action-failed="handleActionFailed"
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
      :class="[
        {
          'fade-in': false, /* Animation disabled */
          /* 'loading-dim': isLoading */
        },
        contentClass
      ]"
      :dir="textDirection.dir"
      :style="{ textAlign: textDirection.textAlign }"
      v-html="renderedContent"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { shouldApplyRtl } from '@/utils/text/textDetection.js'
import { SimpleMarkdown } from '@/utils/text/markdown.js'
import ActionToolbar from '@/features/text-actions/components/ActionToolbar.vue'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

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
  
  // Enhanced error props
  canRetry: {
    type: Boolean,
    default: false
  },
  canOpenSettings: {
    type: Boolean,
    default: false
  },
  onRetry: {
    type: Function,
    default: null
  },
  onOpenSettings: {
    type: Function,
    default: null
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
  },
  
  // Enhanced popup-specific props
  containerClass: {
    type: String,
    default: ''
  },
  contentClass: {
    type: String,
    default: ''
  }
})

// Emits
const emit = defineEmits([
  'text-copied',
  'text-pasted',
  'tts-started',
  'tts-stopped', 
  'tts-speaking', // backward compatibility
  'action-failed',
  'retry-requested',
  'settings-requested'
])

// Refs
const contentRef = ref(null)
const containerRef = ref(null)
// const showFadeIn = ref(false) // Disabled

// Computed
const hasContent = computed(() => props.content.trim().length > 0 && !props.isLoading)
const hasError = computed(() => !!props.error && !props.isLoading)

// Pre-compute text direction to prevent layout shift
const textDirection = computed(() => {
  const textToCheck = props.content || props.error || ''
  const isRtl = shouldApplyRtl(textToCheck)
  return {
    dir: isRtl ? 'rtl' : 'ltr',
    textAlign: isRtl ? 'right' : 'left'
  }
})

const renderedContent = computed(() => {
  if (props.error) {
    const errorActions = []
    
    // Add retry action if available
    if (props.canRetry && props.onRetry) {
      errorActions.push(`<button class="error-action retry-btn" onclick="handleRetry()">🔄 Try Again</button>`) 
    }
    
    // Add settings action if available
    if (props.canOpenSettings && props.onOpenSettings) {
      errorActions.push(`<button class="error-action settings-btn" onclick="handleSettings()">⚙️ Settings</button>`) 
    }
    
    const actionsHtml = errorActions.length > 0 
      ? `<div class="error-actions">${errorActions.join('')}</div>`
      : ''
    
    return `<div class="error-message">
      <div class="error-text">⚠️ ${props.error}</div>
      ${actionsHtml}
    </div>`
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
  // Fade-in animation disabled as requested
  // if (newContent && newContent !== oldContent && props.showFadeInAnimation && !props.isLoading) {
  //   showFadeIn.value = true
  //   setTimeout(() => {
  //     showFadeIn.value = false
  //   }, 400)
  // }
}, { immediate: true })

// Action Toolbar Event Handlers
const handleTextCopied = (text) => {
  emit('text-copied', text)
}

const handleTTSStarted = (data) => {
  emit('tts-started', data)
  emit('tts-speaking', data) // backward compatibility
}

const handleTTSStopped = () => {
  emit('tts-stopped')
}

const handleTTSSpeaking = (data) => {
  emit('tts-speaking', data)
}

const handleActionFailed = (error) => {
  emit('action-failed', error)
}

// Error action handlers
const handleRetry = () => {
  if (props.onRetry) {
    props.onRetry()
  }
  emit('retry-requested')
}

const handleSettings = () => {
  if (props.onOpenSettings) {
    props.onOpenSettings()
  }
  emit('settings-requested')
}

// Make handlers globally accessible for onclick handlers
if (typeof window !== 'undefined') {
  window.handleRetry = handleRetry
  window.handleSettings = handleSettings
}

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
  overflow: visible;
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

.sidepanel-mode {
  overflow: visible;
}

.sidepanel-mode .display-toolbar {
  overflow: visible;
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
/* .translation-content.loading-dim {
  opacity: 1;
  transition: none !important;
} */

/* Fade-in animation removed as requested */
/* .translation-content.fade-in {
  animation: fadeInWithSlide 0.4s cubic-bezier(0.4, 0.0, 0.2, 1);
} */

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
  padding: 12px;
  border-left: 3px solid #dc3545;
  background-color: rgba(220, 53, 69, 0.1);
  border-radius: 6px;
  line-height: 1.4;
}

.translation-content :deep(.error-text) {
  margin-bottom: 8px;
}

.translation-content :deep(.error-actions) {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.translation-content :deep(.error-action) {
  background: #dc3545;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background-color 0.2s ease;
  font-weight: 500;
}

.translation-content :deep(.error-action:hover) {
  background: #c82333;
}

.translation-content :deep(.error-action.retry-btn) {
  background: #007bff;
}

.translation-content :deep(.error-action.retry-btn:hover) {
  background: #0056b3;
}

.translation-content :deep(.error-action.settings-btn) {
  background: #6c757d;
}

.translation-content :deep(.error-action.settings-btn:hover) {
  background: #5a6268;
}

/* Responsive error actions for different modes */
.popup-mode .translation-content :deep(.error-actions) {
  flex-direction: column;
  gap: 4px;
}

.popup-mode .translation-content :deep(.error-action) {
  font-size: 10px;
  padding: 3px 6px;
}

.selection-mode .translation-content :deep(.error-actions) {
  display: none; /* Hide actions in selection mode to keep it minimal */
}

.translation-content :deep(.loading-message) {
  color: var(--accent-color, #1967d2);
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
  border-top: 3px solid var(--accent-color, #1967d2);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* Dark theme spinner styling handled by unified theme variables */
:global(.theme-dark) .translation-display .spinner {
  border-color: var(--header-border-color, #5f6368);
  border-top-color: var(--accent-color, #58a6ff);
}

:global(.theme-dark) .translation-display .translation-content .loading-message {
  color: var(--accent-color, #58a6ff);
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
  overflow: visible;
}

.sidepanel-mode .display-toolbar .action-button {
  overflow: visible;
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

/* Fade-in animation removed as requested */
/* @keyframes fadeInWithSlide {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
} */

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