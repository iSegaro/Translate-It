<template>
  <BaseActionButton
    :size="size"
    :variant="variant"
    :disabled="disabled || tts.ttsState.value === 'loading' || !text || !text.trim()"
    :title="buttonTitle"
    :label="buttonLabel"
    :show-label="showLabel"
    :custom-classes="ttsButtonClasses"
    @click="handleClick"
  >
    <template #icon>
      <!-- Icon Container -->
      <div class="icon-container">
        <!-- Idle State Icon -->
        <svg
          v-if="tts.ttsState.value === 'idle'"
          class="tts-icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
        >
          <path
            fill="currentColor"
            d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
          />
        </svg>

        <!-- Loading State Icon with Animation -->
        <svg
          v-else-if="tts.ttsState.value === 'loading'"
          class="tts-icon loading-spin"
          viewBox="0 0 24 24"
          width="16"
          height="16"
        >
          <path
            fill="currentColor"
            d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
          />
          <path
            fill="currentColor"
            opacity="0.5"
            d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
          />
        </svg>

        <!-- Playing State Icon (Stop) -->
        <svg
          v-else-if="tts.ttsState.value === 'playing'"
          class="tts-icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
        >
          <path
            fill="currentColor"
            d="M6 6h12v12H6z"
          />
        </svg>

        <!-- Error State Icon -->
        <svg
          v-else-if="tts.ttsState.value === 'error'"
          class="tts-icon error-icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
        >
          <path
            fill="currentColor"
            d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
          />
          <circle
            fill="currentColor"
            cx="20"
            cy="6"
            r="3"
          />
        </svg>
      </div>
    </template>
  </BaseActionButton>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import BaseActionButton from '@/features/text-actions/components/BaseActionButton.vue'
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TTSButton')

// Props
const props = defineProps({
  text: {
    type: String,
    default: '',
    validator: (value) => typeof value === 'string'
  },
  language: {
    type: String,
    default: 'auto'
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  },
  showLabel: {
    type: Boolean,
    default: false
  },
})

// Emits
const emit = defineEmits([
  'tts-started',
  'tts-stopped',
  'tts-error',
  'state-changed'
])

// TTS Composable
const tts = useTTSSmart()

// Computed Properties
const ttsButtonClasses = computed(() => [
  'tts-button',
  `tts-button--${tts.ttsState.value}`,
  {
    'tts-button--has-label': props.showLabel
  }
])

const buttonTitle = computed(() => {
  switch (tts.ttsState.value) {
    case 'idle':
      return 'Speak text'
    case 'loading':
      return 'Loading...'
    case 'playing':
      return 'Stop speech'
    case 'error':
      return `Error: ${tts.errorMessage.value || 'Click to retry'}`
    default:
      return 'Text to speech'
  }
})

const buttonLabel = computed(() => {
  switch (tts.ttsState.value) {
    case 'idle':
      return 'Speak'
    case 'loading':
      return 'Loading...'
    case 'playing':
      return 'Stop'
    case 'error':
      return 'Retry'
    default:
      return 'TTS'
  }
})


// Methods
const handleClick = async () => {
  if (props.disabled) return
  
  // Check if text is available for TTS actions
  if (!props.text || !props.text.trim()) {
    logger.warn('[TTSButton] No text available for TTS')
    return
  }

  logger.debug('[TTSButton] Button clicked, current state:', tts.ttsState.value)

  try {
    let result = false

    switch (tts.ttsState.value) {
      case 'idle':
        result = await tts.speak(props.text, props.language)
        if (result) emit('tts-started', { text: props.text, language: props.language })
        break

      case 'loading':
      case 'playing':
        result = await tts.stop()
        if (result) emit('tts-stopped')
        break

      case 'error':
        result = await tts.retry()
        if (result) {
          emit('tts-started', { text: props.text, language: props.language })
        } else {
          emit('tts-error', { error: tts.errorMessage.value })
        }
        break

      default:
        logger.warn('[TTSButton] Unknown TTS state:', tts.ttsState.value)
        result = await tts.stop()
        if (result) emit('tts-stopped')
    }

    logger.debug('[TTSButton] Action completed:', result)
  } catch (error) {
    logger.error('[TTSButton] Action failed:', error)
    emit('tts-error', { error: error.message || 'TTS action failed' })
  }
}

// Watch for state changes and emit events
watch(() => tts.ttsState.value, (newState, oldState) => {
  if (oldState !== undefined) {
    logger.debug('[TTSButton] State changed:', oldState, '→', newState)
    emit('state-changed', { 
      from: oldState, 
      to: newState,
      canPause: tts.canPause.value,
      canResume: tts.canResume.value,
      canStop: tts.canStop.value
    })
  }
})
</script>

<style scoped>
/* TTS Button specific styles */
.tts-button {
  /* No additional styling needed - BaseActionButton handles it */
}

/* State-specific Styles */
.tts-button--loading {
  pointer-events: none;
}

.tts-button--playing {
  border-color: var(--color-error, #dc3545);
}

.tts-button--error {
  border-color: var(--color-error, #dc3545);
}

/* Icon Container */
.icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* TTS Icon */
.tts-icon {
  transition: all 0.2s ease;
  flex-shrink: 0;
  color: inherit;
}

/* Ensure SVG paths inherit proper color */
.tts-icon path {
  fill: currentColor;
  stroke: none;
}

.loading-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-icon {
  color: currentColor;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .tts-icon {
    transition: none;
  }
  
  .loading-spin {
    animation: none;
  }
}

</style>