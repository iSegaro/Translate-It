<template>
  <BaseActionButton
    :size="size"
    :variant="variant"
    :disabled="!canCopy"
    :title="computedTitle"
    :aria-label="computedAriaLabel"
    :label="label"
    :show-label="showLabel"
    :custom-classes="['ti-copy-button', { 'ti-copying': isCopying }]"
    @click="handleCopy"
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
      <!-- Success feedback - Teleported to body to escape all clipping parents -->
      <Teleport to="body">
        <Transition name="ti-feedback">
          <div
            v-if="showFeedback"
            class="ti-copy-feedback-global"
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
import { useCopyAction } from '@/features/text-actions/composables/useCopyAction.js'
import { SimpleMarkdown } from '@/shared/utils/text/markdown.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'CopyButton')

// i18n
const { t } = useI18n()

// Props
const props = defineProps({
  text: {
    type: String,
    default: ''
  },
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
  },
  clean: {
    type: Boolean,
    default: true
  }
})

// Computed for i18n defaults
const computedTitle = computed(() => props.title || t('action_copy_text'))
const computedAriaLabel = computed(() => props.ariaLabel || t('action_copy_to_clipboard'))

// Emits
const emit = defineEmits(['copied', 'copy-failed'])

// Composables
const { copyText, isCopying } = useCopyAction()

// Local state
const showFeedback = ref(false)
const feedbackPosition = ref({ top: '0px', left: '0px' })

// Computed
const canCopy = computed(() => {
  // Always allow the button to be clickable if not explicitly disabled
  // The actual copy functionality will check for text content
  return !props.disabled && !isCopying.value
})

const hasTextToCopy = computed(() => {
  return props.text && typeof props.text === 'string' && props.text.trim().length > 0
})

const iconSrc = computed(() => {
  // Use existing icon from assets
  return browser.runtime.getURL('icons/ui/copy.png')
})
// Methods
const handleCopy = async (event) => {
  if (!canCopy.value || !hasTextToCopy.value) return

  // Calculate position for teleported feedback
  if (event && event.currentTarget) {
    const rect = event.currentTarget.getBoundingClientRect()
    feedbackPosition.value = {
      top: `${rect.top - 30}px`,
      left: `${rect.left + rect.width / 2}px`
    }
  } else {
    // Fallback if event is missing (should not happen after BaseActionButton fix)
    feedbackPosition.value = { top: '50%', left: '50%' }
  }

  // Clean text if requested
  const textToCopy = props.clean ? SimpleMarkdown.strip(props.text) : props.text
  
  // Log click event
  logger.debug('📋 Copy button clicked!', {
    text: textToCopy.slice(0, 20) + (textToCopy.length > 20 ? '...' : ''),
    source: 'Vue CopyButton',
    cleaned: props.clean
  })

  try {
    logger.debug('[CopyButton] Copying text:', textToCopy.substring(0, 50) + '...')
    
    const success = await copyText(textToCopy)
    
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
/* Copy button specific styles */
.ti-copy-button.ti-copying {
  opacity: 0.7;
}

/* Button elements */
.ti-button-icon {
  flex-shrink: 0;
  object-fit: contain;
  filter: var(--icon-filter);
}

/* Feedback animation - Fixed positioning for Teleport */
.ti-copy-feedback-global {
  position: fixed; /* نمایش به صورت فیکس در کل صفحه */
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  z-index: 2147483647; /* حداکثر مقدار ممکن برای نمایش روی همه چیز */
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
