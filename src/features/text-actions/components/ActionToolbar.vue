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
        :title="computedCopyTitle"
        :aria-label="computedCopyAriaLabel"
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
      <span
        v-if="showLanguageLabel"
        class="ti-language-label"
      >
        {{ languageLabelText }}
      </span>
      <PasteButton
        v-if="showPaste"
        :size="buttonSize"
        :variant="buttonVariant"
        :title="computedPasteTitle"
        :aria-label="computedPasteAriaLabel"
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
import './ActionToolbar.scss';
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CopyButton from './CopyButton.vue'
import PasteButton from './PasteButton.vue'
import TTSButton from '@/components/shared/TTSButton.vue' // Updated to use the new enhanced TTSButton
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { getLanguageNameFromCode } from '@/shared/config/languageConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ActionToolbar')

// i18n
const { t } = useI18n()

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
  detectedLanguage: {
    type: String,
    default: undefined
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
    default: undefined
  },
  copyAriaLabel: {
    type: String,
    default: undefined
  },
  pasteTitle: {
    type: String,
    default: undefined
  },
  pasteAriaLabel: {
    type: String,
    default: undefined
  },
  ttsTitle: {
    type: String,
    default: undefined
  },
  ttsAriaLabel: {
    type: String,
    default: undefined
  }
})

// Computed for i18n defaults
const computedCopyTitle = computed(() => props.copyTitle || t('action_copy_text'))
const computedCopyAriaLabel = computed(() => props.copyAriaLabel || t('action_copy_to_clipboard'))
const computedPasteTitle = computed(() => props.pasteTitle || t('action_paste_from_clipboard'))
const computedPasteAriaLabel = computed(() => props.pasteAriaLabel || t('action_paste_from_clipboard'))

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
  return props.text && typeof props.text === 'string' && props.text.trim().length > 0
})

const buttonSize = computed(() => {
  return props.size
})

const buttonVariant = computed(() => {
  return props.variant
})

const showLanguageLabel = computed(() => {
  if (!props.text || props.text.trim().length === 0) return false;

  // Input mode: Show detected language
  if (props.mode === 'input') {
    return props.detectedLanguage && props.detectedLanguage !== 'auto';
  }
  
  // Output mode & Sidepanel: Show target language
  if (props.mode === 'output' || props.mode === 'sidepanel') {
    return props.language && props.language !== 'auto';
  }

  return false;
})

const languageLabelText = computed(() => {
  const code = (props.mode === 'input') ? props.detectedLanguage : props.language;
  if (!code || code === 'auto') return '';
  
  const name = getLanguageNameFromCode(code);
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
})

// Event Handlers
const handleCopied = (text) => {
  logger.debug('[ActionToolbar] Text copied:', text.substring(0, 50) + '...')
  emit('text-copied', text)
}

const handleCopyFailed = (error) => {
  const errorMessage = error?.message || error
  logger.error(`[ActionToolbar] Copy failed: ${errorMessage}`, error)
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
  const errorMessage = error?.message || error
  logger.error(`[ActionToolbar] Paste failed: ${errorMessage}`, error)
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
  // Extract error message for the log line
  const errorMessage = error?.error || error?.message || (typeof error === 'string' ? error : 'Unknown TTS error')
  
  // Log with both descriptive message and original error object
  logger.error(`[ActionToolbar] TTS failed: ${errorMessage}`, error)
  
  emit('tts-error', error)
  // Backward compatibility
  emit('action-failed', { action: 'tts', error })
}

const handleTTSStateChanged = (data) => {
  logger.debug('[ActionToolbar] TTS state changed:', data.from, '→', data.to)
  emit('tts-state-changed', data)
}
</script>
