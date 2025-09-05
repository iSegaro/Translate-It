<template>
  <BaseActionButton
    :size="size"
    :variant="variant"
    :disabled="!canPaste"
    :title="title"
    :aria-label="ariaLabel"
    :label="label"
    :show-label="showLabel"
    :custom-classes="['paste-button', { 'pasting': isPasting }]"
    @click="handlePaste"
  >
    <template #icon>
      <img 
        :src="iconSrc" 
        :alt="iconAlt"
        class="button-icon"
        style="width: 16px !important; height: 16px !important; object-fit: contain;"
      >
    </template>
    
    <template #feedback>
      <!-- Success feedback -->
      <Transition name="feedback">
        <div
          v-if="showFeedback"
          class="paste-feedback"
        >
          ✓ {{ feedbackText }}
        </div>
      </Transition>
    </template>
  </BaseActionButton>
</template>

<script setup>
import { ref, computed } from 'vue'
import BaseActionButton from './BaseActionButton.vue'
import { usePasteAction } from '@/features/text-actions/composables/usePasteAction.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'PasteButton')

// Props
const props = defineProps({
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
  title: {
    type: String,
    default: 'Paste from clipboard'
  },
  ariaLabel: {
    type: String,
    default: 'Paste text from clipboard'
  },
  iconAlt: {
    type: String,
    default: 'Paste'
  },
  label: {
    type: String,
    default: 'Paste'
  },
  showLabel: {
    type: Boolean,
    default: false
  },
  feedbackText: {
    type: String,
    default: 'Pasted!'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  autoTranslate: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['pasted', 'paste-failed'])

// Composables
const { pasteText, isPasting, hasClipboardContent } = usePasteAction()

// Local state
const showFeedback = ref(false)

// Computed
const canPaste = computed(() => {
  return !props.disabled && hasClipboardContent.value && !isPasting.value
})

const iconSrc = computed(() => {
  // Use existing icon from assets
  return new URL('@/assets/icons/ui/paste.png', import.meta.url).href
})

// Methods
const handlePaste = async () => {
  if (!canPaste.value) return
  
  // Log click event
  logger.debug('📥 Paste button clicked!', { 
    source: 'Vue PasteButton'
  })
  
  try {
    logger.debug('[PasteButton] Attempting to paste from clipboard')
    
    const text = await pasteText()
    
    if (text) {
      // Show feedback
      showFeedback.value = true
      setTimeout(() => {
        showFeedback.value = false
      }, 2000)
      
      emit('pasted', {
        text,
        autoTranslate: props.autoTranslate
      })
      logger.debug('[PasteButton] Text pasted successfully:', text.substring(0, 50) + '...')
    } else {
      emit('paste-failed', new Error('No text found in clipboard'))
      logger.warn('[PasteButton] No text found in clipboard')
    }
  } catch (error) {
    emit('paste-failed', error)
    logger.error('[PasteButton] Paste error:', error)
  }
}
</script>

<style scoped>
/* Paste button specific styles */
.paste-button.pasting {
  opacity: 0.7;
}

/* Button elements */
.button-icon {
  flex-shrink: 0;
  object-fit: contain;
  filter: var(--icon-filter);
}

/* Feedback animation */
.paste-feedback {
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
  .variant-standalone {
    border-color: rgba(255, 255, 255, 0.2);
    background-color: rgba(0, 0, 0, 0.9);
  }
}
</style>
