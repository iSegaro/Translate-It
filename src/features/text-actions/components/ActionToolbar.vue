<template>
  <div
    class="ti-action-toolbar"
    :class="[
      `ti-mode-${mode}`,
      `ti-layout-${layout}`,
      `ti-position-${position}`,
      { 'ti-visible': visible, 'ti-has-content': hasContent }
    ]"
  >
    <!-- Left group: Copy + TTS -->
    <div class="ti-toolbar-left">
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
    <div class="ti-toolbar-right">
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
import TTSButton from '@/components/shared/TTSButton.vue' // Updated to use the new enhanced TTSButton
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

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
  logger.debug('[ActionToolbar] TTS started:', data.text.substring(0, 50) + '...', {
    receivedLanguage: props.language,
    passedToTTS: data.language
  })
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
.ti-action-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  /* transition: opacity 0.2s ease, visibility 0.2s ease; */
  width: 100%;
}

/* Toolbar groups */
.ti-toolbar-left,
.ti-toolbar-right {
  display: flex;
  gap: 2px;
  align-items: center;
  flex-shrink: 1;
  min-width: 0;
  overflow: visible;
}

.ti-toolbar-left {
  flex: 0 1 auto;
}

.ti-toolbar-right {
  flex: 0 1 auto;
}

/* Layout variants */
.ti-layout-horizontal {
  flex-direction: row;
}

.ti-layout-horizontal .ti-toolbar-left,
.ti-layout-horizontal .ti-toolbar-right {
  flex-direction: row;
}

.ti-layout-vertical {
  flex-direction: column;
  justify-content: flex-start;
  gap: 4px;
}

.ti-layout-vertical .ti-toolbar-left,
.ti-layout-vertical .ti-toolbar-right {
  flex-direction: column;
  width: 100%;
}

.ti-layout-vertical .ti-toolbar-right {
  margin-top: 4px;
}

/* Position variants */
.ti-position-top-right {
  position: absolute;
  top: 8px;
  right: 0px;
  max-width: calc(100% - 24px);
  box-sizing: border-box;
}

.ti-position-top-left {
  position: absolute;
  top: 8px;
  left: 0px;
  max-width: calc(100% - 24px);
  box-sizing: border-box;
}

.ti-position-bottom-right {
  position: absolute;
  bottom: 8px;
  right: 0px;
  max-width: calc(100% - 24px);
  box-sizing: border-box;
  right: 8px;
}

.ti-position-bottom-left {
  position: absolute;
  bottom: 8px;
  left: 0px;
  max-width: calc(100% - 24px);
  box-sizing: border-box;
}

.ti-position-inline {
  position: relative;
  display: inline-flex;
}

/* Mode-specific styles - simplified */
.ti-mode-input,
.ti-mode-output,
.ti-mode-floating {
  background: var(--color-background, rgba(255, 255, 255, 0.95));
  border-radius: 4px;
  padding: 2px;
  border: 1px solid var(--color-border, transparent);
}

.ti-mode-inline,
.ti-mode-sidepanel {
  background: transparent;
  padding: 2px;
}

/* Content-based visibility - Removed to always show toolbar with full opacity
   Individual buttons now handle disabled state instead of toolbar transparency */

/* Dark mode support - using theme classes for consistency */
:root.theme-dark .ti-mode-input,
:root.theme-dark .ti-mode-output,
:root.theme-dark .ti-mode-floating,
.theme-dark .ti-mode-input,
.theme-dark .ti-mode-output,
.theme-dark .ti-mode-floating {
  background: var(--color-surface, rgba(32, 33, 36, 0.9));
  border-color: var(--color-border, rgba(255, 255, 255, 0.15));
}

/* Ensure proper spacing for icon-only buttons */
:root.theme-dark .ti-action-toolbar,
.theme-dark .ti-action-toolbar {
  /* Add slight padding to ensure icons have proper spacing */
  gap: 2px;
}
</style>
