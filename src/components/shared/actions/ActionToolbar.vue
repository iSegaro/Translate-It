<template>
  <div
    class="action-toolbar"
    :class="[
      `mode-${mode}`,
      `layout-${layout}`,
      `position-${position}`,
      { 'visible': visible, 'has-content': hasContent }
    ]"
  >
    <!-- Left group: Copy + TTS -->
    <div class="toolbar-left">
      <CopyButton
        v-if="showCopy"
        :text="text"
        :size="buttonSize"
        :variant="buttonVariant"
        :title="copyTitle"
        :aria-label="copyAriaLabel"
        :disabled="copyDisabled"
        @copied="handleCopied"
        @copy-failed="handleCopyFailed"
      />
      
      <TTSButton
        v-if="showTTS"
        :text="text"
        :language="language"
        :size="buttonSize"
        :variant="buttonVariant"
        :disabled="ttsDisabled"
        @tts-started="handleTTSStarted"
        @tts-stopped="handleTTSStopped"
        @tts-error="handleTTSFailed"
        @state-changed="handleTTSStateChanged"
      />
    </div>
    
    <!-- Right group: Paste -->
    <div class="toolbar-right">
      <PasteButton
        v-if="showPaste"
        :size="buttonSize"
        :variant="buttonVariant"
        :title="pasteTitle"
        :aria-label="pasteAriaLabel"
        :disabled="pasteDisabled"
        :auto-translate="autoTranslateOnPaste"
        @pasted="handlePasted"
        @paste-failed="handlePasteFailed"
      />
    </div>
    
    <!-- Custom actions slot -->
    <slot name="custom-actions" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import CopyButton from './CopyButton.vue'
import PasteButton from './PasteButton.vue'
import TTSButton from '../TTSButton.vue' // Updated to use the new enhanced TTSButton
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ActionToolbar')

// Props
const props = defineProps({
  // Content
  text: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'auto'
  },
  
  // Display control
  mode: {
    type: String,
    default: 'output',
    validator: (value) => ['input', 'output', 'inline', 'floating', 'sidepanel'].includes(value)
  },
  layout: {
    type: String,
    default: 'horizontal', // horizontal, vertical
    validator: (value) => ['horizontal', 'vertical'].includes(value)
  },
  position: {
    type: String,
    default: 'top-right', // top-right, top-left, bottom-right, bottom-left, inline
    validator: (value) => ['top-right', 'top-left', 'bottom-right', 'bottom-left', 'inline'].includes(value)
  },
  visible: {
    type: Boolean,
    default: true
  },
  
  // Button control
  showCopy: {
    type: Boolean,
    default: true
  },
  showPaste: {
    type: Boolean,
    default: true
  },
  showTTS: {
    type: Boolean,
    default: true
  },
  
  // Size and styling
  size: {
    type: String,
    default: 'sm',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  variant: {
    type: String,
    default: 'secondary',
    validator: (value) => ['primary', 'secondary'].includes(value)
  },
  
  // Behavior
  autoTranslateOnPaste: {
    type: Boolean,
    default: false
  },
  
  // Disabled states
  copyDisabled: {
    type: Boolean,
    default: false
  },
  pasteDisabled: {
    type: Boolean,
    default: false
  },
  ttsDisabled: {
    type: Boolean,
    default: false
  },
  
  // i18n titles
  copyTitle: {
    type: String,
    default: 'Copy text'
  },
  copyAriaLabel: {
    type: String,
    default: 'Copy text to clipboard'
  },
  pasteTitle: {
    type: String,
    default: 'Paste from clipboard'
  },
  pasteAriaLabel: {
    type: String,
    default: 'Paste text from clipboard'
  },
  ttsTitle: {
    type: String,
    default: 'Play text'
  },
  ttsAriaLabel: {
    type: String,
    default: 'Play text to speech'
  }
})

// Emits
const emit = defineEmits([
  'text-copied',
  'text-pasted', 
  'tts-speaking', // Backward compatibility
  'tts-stopped',
  'tts-started',
  'tts-error',
  'tts-state-changed',
  'action-failed'
])

// Computed
const hasContent = computed(() => {
  return props.text && props.text.trim().length > 0
})

const buttonSize = computed(() => {
  return props.size
})

const buttonVariant = computed(() => {
  return props.variant
})

// Event Handlers
const handleCopied = (text) => {
  logger.debug('[ActionToolbar] Text copied:', text.substring(0, 50) + '...')
  emit('text-copied', text)
}

const handleCopyFailed = (error) => {
  logger.error('[ActionToolbar] Copy failed:', error)
  emit('action-failed', { action: 'copy', error })
}

const handlePasted = (data) => {
  logger.debug('[ActionToolbar] Text pasted:', data.text.substring(0, 50) + '...')
  emit('text-pasted', {
    text: data.text,
    autoTranslate: data.autoTranslate
  })
}

const handlePasteFailed = (error) => {
  logger.error('[ActionToolbar] Paste failed:', error)
  emit('action-failed', { action: 'paste', error })
}

// Enhanced TTS event handlers for new TTSButton
const handleTTSStarted = (data) => {
  logger.debug('[ActionToolbar] TTS started:', data.text.substring(0, 50) + '...')
  emit('tts-started', data)
  // Backward compatibility
  emit('tts-speaking', data)
}

const handleTTSStopped = () => {
  logger.debug('[ActionToolbar] TTS stopped')
  emit('tts-stopped')
}

const handleTTSFailed = (error) => {
  logger.error('[ActionToolbar] TTS failed:', error)
  emit('tts-error', error)
  // Backward compatibility
  emit('action-failed', { action: 'tts', error })
}

const handleTTSStateChanged = (data) => {
  logger.debug('[ActionToolbar] TTS state changed:', data.from, '→', data.to)
  emit('tts-state-changed', data)
}
</script>

<style scoped>
.action-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: opacity 0.2s ease, visibility 0.2s ease;
  width: 100%;
}

.action-toolbar:not(.visible) {
  opacity: 0;
  visibility: hidden;
}

/* Toolbar groups */
.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 2px;
  align-items: center;
  flex-shrink: 1;
  min-width: 0;
  overflow: visible;
}

.toolbar-left {
  flex: 0 1 auto;
}

.toolbar-right {
  flex: 0 1 auto;
}

/* Layout variants */
.layout-horizontal {
  flex-direction: row;
}

.layout-horizontal .toolbar-left,
.layout-horizontal .toolbar-right {
  flex-direction: row;
}

.layout-vertical {
  flex-direction: column;
  justify-content: flex-start;
  gap: 4px;
}

.layout-vertical .toolbar-left,
.layout-vertical .toolbar-right {
  flex-direction: column;
  width: 100%;
}

.layout-vertical .toolbar-right {
  margin-top: 4px;
}

/* Position variants */
.position-top-right {
  position: absolute;
  top: 8px;
  right: 0px;
  max-width: calc(100% - 24px);
  box-sizing: border-box;
}

.position-top-left {
  position: absolute;
  top: 8px;
  left: 0px;
  max-width: calc(100% - 24px);
  box-sizing: border-box;
}

.position-bottom-right {
  position: absolute;
  bottom: 8px;
  right: 0px;
  max-width: calc(100% - 24px);
  box-sizing: border-box;
  right: 8px;
}

.position-bottom-left {
  position: absolute;
  bottom: 8px;
  left: 0px;
  max-width: calc(100% - 24px);
  box-sizing: border-box;
}

.position-inline {
  position: relative;
  display: inline-flex;
}

/* Mode-specific styles */
.mode-input {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  padding: 2px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(4px);
}

.mode-output {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  padding: 1px;
}

.mode-inline {
  background: transparent;
  padding: 0;
}

.mode-floating {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(8px);
}

.mode-sidepanel {
  background: transparent;
  border-radius: 4px;
  padding: 2px 8px;
  max-width: 100%;
  box-sizing: border-box;
  overflow: visible;
  min-height: 28px;
}

.mode-sidepanel.position-top-right,
.mode-sidepanel.position-top-left,
.mode-sidepanel.position-bottom-right,
.mode-sidepanel.position-bottom-left {
  max-width: calc(100% - 24px);
}

/* Responsive button adjustments for constrained spaces */
.mode-sidepanel :deep(.action-button) {
  min-width: auto;
  flex-shrink: 1;
}

.mode-sidepanel .toolbar-left,
.mode-sidepanel .toolbar-right {
  gap: 2px;
}

/* Content-based visibility */
.mode-input:not(.has-content),
.mode-output:not(.has-content) {
  opacity: 0.3;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .mode-input {
    background: rgba(0, 0, 0, 0.3);
    box-shadow: 0 1px 3px rgba(255, 255, 255, 0.05);
  }
  
  .mode-output {
    background: rgba(255, 255, 255, 0.05);
  }
  
  .mode-floating {
    background: rgba(0, 0, 0, 0.95);
    box-shadow: 0 2px 8px rgba(255, 255, 255, 0.15);
  }
}
</style>
