<template>
  <BaseActionButton
    :size="size"
    :variant="variant"
    :disabled="!canPaste"
    :title="computedTitle"
    :aria-label="computedAriaLabel"
    :label="label"
    :show-label="showLabel"
    :custom-classes="['ti-paste-button', { 'ti-pasting': isPasting }]"
    @click="handlePaste"
  >
    <template #icon>
      <img 
        :src="iconSrc" 
        :alt="iconAlt"
        class="ti-button-icon"
        style="width: 16px !important; height: 16px !important; object-fit: contain;"
      >
    </template>
    
    <template #feedback>
      <!-- Success feedback - Teleported to body -->
      <Teleport to="body">
        <Transition name="ti-feedback">
          <div
            v-if="showFeedback"
            class="ti-paste-feedback-global"
            :style="feedbackPosition"
          >
            ✓ {{ feedbackText }}
          </div>
        </Transition>
      </Teleport>
    </template>
  </BaseActionButton>
</template>

<script setup>
import { ref, computed } from 'vue'
import browser from 'webextension-polyfill'
import { useI18n } from 'vue-i18n'
import BaseActionButton from './BaseActionButton.vue'
import { usePasteAction } from '@/features/text-actions/composables/usePasteAction.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'PasteButton')

// i18n
const { t } = useI18n()

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
    default: undefined
  },
  ariaLabel: {
    type: String,
    default: undefined
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

// Computed for i18n defaults
const computedTitle = computed(() => props.title || t('action_paste_from_clipboard'))
const computedAriaLabel = computed(() => props.ariaLabel || t('action_paste_from_clipboard'))

// Emits
const emit = defineEmits(['pasted', 'paste-failed'])

// Composables
const { pasteText, isPasting, hasClipboardContent } = usePasteAction()

// Local state
const showFeedback = ref(false)
const feedbackPosition = ref({ top: '0px', left: '0px' })

// Computed
const canPaste = computed(() => {
  return !props.disabled && hasClipboardContent.value && !isPasting.value
})

const iconSrc = computed(() => {
  // Use existing icon from assets
  return browser.runtime.getURL('icons/ui/paste.png')
})
// Methods
const handlePaste = async (event) => {
  if (!canPaste.value) return

  // Calculate position for teleported feedback
  if (event && event.currentTarget) {
    const rect = event.currentTarget.getBoundingClientRect()
    feedbackPosition.value = {
      top: `${rect.top - 30}px`,
      left: `${rect.left + rect.width / 2}px`
    }
  } else {
    // Fallback position
    feedbackPosition.value = { top: '50%', left: '50%' }
  }

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
.ti-paste-button.ti-pasting {
  opacity: 0.7;
}

/* Button elements */
.ti-button-icon {
  flex-shrink: 0;
  object-fit: contain;
  filter: var(--icon-filter);
}

/* Feedback animation - Fixed positioning for Teleport */
.ti-paste-feedback-global {
  position: fixed; /* نمایش به صورت فیکس در کل صفحه */
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  z-index: 2147483647; /* حداکثر مقدار ممکن */
  pointer-events: none;
  box-shadow: 0 4px 8px rgba(0,0,0,0.3);
}

.ti-feedback-enter-active,
.ti-feedback-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.ti-feedback-enter-from,
.ti-feedback-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .ti-variant-standalone {
    border-color: rgba(255, 255, 255, 0.2);
    background-color: rgba(0, 0, 0, 0.9);
  }
}
</style>
