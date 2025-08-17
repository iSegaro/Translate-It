<template>
  <button
    type="button"
    class="action-button copy-button"
    :class="[
      `size-${size}`,
      `variant-${variant}`,
      { 'disabled': !canCopy, 'copying': isCopying }
    ]"
    :disabled="!canCopy"
    :title="title"
    :aria-label="ariaLabel"
    @click="handleCopy"
  >
    <img 
      :src="iconSrc" 
      :alt="iconAlt"
      class="button-icon"
    >
    <span
      v-if="showLabel"
      class="button-label"
    >{{ label }}</span>
    
    <!-- Success feedback -->
    <Transition name="feedback">
      <div
        v-if="showFeedback"
        class="copy-feedback"
      >
        ✓ {{ feedbackText }}
      </div>
    </Transition>
  </button>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCopyAction } from '@/composables/actions/useCopyAction.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'CopyButton')

// Props
const props = defineProps({
  text: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  },
  variant: {
    type: String,
    default: 'inline',
    validator: (value) => ['inline', 'standalone', 'toolbar'].includes(value)
  },
  title: {
    type: String,
    default: 'Copy text'
  },
  ariaLabel: {
    type: String,
    default: 'Copy text to clipboard'
  },
  iconAlt: {
    type: String,
    default: 'Copy'
  },
  label: {
    type: String,
    default: 'Copy'
  },
  showLabel: {
    type: Boolean,
    default: false
  },
  feedbackText: {
    type: String,
    default: 'Copied!'
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['copied', 'copy-failed'])

// Composables
const { copyText, isCopying } = useCopyAction()

// Local state
const showFeedback = ref(false)

// Computed
const canCopy = computed(() => {
  return !props.disabled && props.text && props.text.trim().length > 0 && !isCopying.value
})

const iconSrc = computed(() => {
  // Use existing icon from assets
  return new URL('@/assets/icons/copy.png', import.meta.url).href
})

// Methods
const handleCopy = async () => {
  if (!canCopy.value) return
  
  // Log click event
  logger.debug('📋 Copy button clicked!', { 
    text: props.text.slice(0, 20) + (props.text.length > 20 ? '...' : ''),
    source: 'Vue CopyButton'
  })
  
  try {
    logger.debug('[CopyButton] Copying text:', props.text.substring(0, 50) + '...')
    
    const success = await copyText(props.text)
    
    if (success) {
      // Show feedback
      showFeedback.value = true
      setTimeout(() => {
        showFeedback.value = false
      }, 2000)
      
      emit('copied', props.text)
      logger.debug('[CopyButton] Text copied successfully')
    } else {
      emit('copy-failed', new Error('Copy operation failed'))
      logger.warn('[CopyButton] Copy operation failed')
    }
  } catch (error) {
    emit('copy-failed', error)
    logger.error('[CopyButton] Copy error:', error)
  }
}
</script>

<style scoped>
.action-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
  user-select: none;
}

.action-button:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.action-button:active {
  transform: scale(0.95);
}

.action-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-button.copying {
  opacity: 0.7;
}

/* Size variants */
.size-small {
  padding: 2px;
  min-width: 20px;
  min-height: 20px;
}

.size-small .button-icon {
  width: 14px;
  height: 14px;
}

.size-medium {
  padding: 6px;
  min-width: 32px;
  min-height: 32px;
}

.size-medium .button-icon {
  width: 20px;
  height: 20px;
}

.size-large {
  padding: 8px;
  min-width: 40px;
  min-height: 40px;
}

.size-large .button-icon {
  width: 24px;
  height: 24px;
}

/* Variant styles */
.variant-inline {
  margin: 0 2px;
}

.variant-standalone {
  border: 1px solid rgba(0, 0, 0, 0.2);
  background-color: rgba(255, 255, 255, 0.9);
}

.variant-toolbar {
  margin: 0 1px;
  border-radius: 2px;
}

/* Button elements */
.button-icon {
  flex-shrink: 0;
  object-fit: contain;
}

.button-label {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

/* Feedback animation */
.copy-feedback {
  position: absolute;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  z-index: 1000;
}

.feedback-enter-active,
.feedback-leave-active {
  transition: all 0.3s ease;
}

.feedback-enter-from,
.feedback-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .action-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  
  .variant-standalone {
    border-color: rgba(255, 255, 255, 0.2);
    background-color: rgba(0, 0, 0, 0.9);
  }
}
</style>
