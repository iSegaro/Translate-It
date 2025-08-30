<template>
  <button
    type="button"
    :class="buttonClasses"
    :disabled="disabled || tts.ttsState.value === 'loading' || !text || !text.trim()"
    :title="buttonTitle"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
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

      <!-- Progress Ring for Playing State -->
      <svg
        v-if="tts.ttsState.value === 'playing' && showProgress"
        class="progress-ring"
        :class="progressRingClasses"
        viewBox="0 0 24 24"
        width="20"
        height="20"
      >
        <circle
          class="progress-ring-background"
          cx="12"
          cy="12"
          r="10"
          fill="transparent"
          stroke="currentColor"
          stroke-width="1.5"
          opacity="0.2"
        />
        <circle
          class="progress-ring-progress"
          cx="12"
          cy="12"
          r="10"
          fill="transparent"
          stroke="currentColor"
          stroke-width="1.5"
          :stroke-dasharray="progressCircumference"
          :stroke-dashoffset="progressOffset"
          transform="rotate(-90 12 12)"
        />
      </svg>
    </div>

    <!-- Optional Text Label -->
    <span
      v-if="showLabel"
      class="tts-label"
    >
      {{ buttonLabel }}
    </span>
  </button>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useTTSSmart } from '@/composables/useTTSSmart.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'

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
  showProgress: {
    type: Boolean,
    default: true
  }
})

// Emits
const emit = defineEmits([
  'tts-started',
  'tts-stopped',
  'tts-error',
  'state-changed'
])

// State
const isHovered = ref(false)

// TTS Composable
const tts = useTTSSmart()

// Computed Properties
const buttonClasses = computed(() => [
  'tts-button',
  `tts-button--${props.size}`,
  `tts-button--${props.variant}`,
  `tts-button--${tts.ttsState.value}`,
  {
    'tts-button--hovered': isHovered.value,
    'tts-button--disabled': props.disabled,
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

const progressRingClasses = computed(() => ({
  'progress-ring--animated': tts.ttsState.value === 'playing'
}))

// Progress calculation for ring
const progressRadius = 10
const progressCircumference = 2 * Math.PI * progressRadius

const progressOffset = computed(() => {
  const progress = Math.max(0, Math.min(100, tts.progress.value || 0))
  return progressCircumference - (progress / 100) * progressCircumference
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

const handleMouseEnter = () => {
  isHovered.value = true
}

const handleMouseLeave = () => {
  isHovered.value = false
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
/* Base Button Styles */
.tts-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  font-weight: 500;
  outline: none;
  overflow: hidden;
  white-space: nowrap;
}

.tts-button:focus {
  outline: 2px solid var(--focus-color, #007bff);
  outline-offset: 2px;
}

/* Size Variants */
.tts-button--sm {
  padding: 4px 6px;
  min-height: 24px;
  font-size: 12px;
  gap: 4px;
}

.tts-button--md {
  padding: 6px 8px;
  min-height: 32px;
  font-size: 14px;
  gap: 6px;
}

.tts-button--lg {
  padding: 8px 12px;
  min-height: 40px;
  font-size: 16px;
  gap: 8px;
}

/* Color Variants - Primary */
.tts-button--primary {
  background-color: var(--tts-primary-bg, #007bff);
  color: var(--tts-primary-text, #ffffff);
  border: 1px solid var(--tts-primary-border, #007bff);
}

.tts-button--primary:hover:not(:disabled) {
  background-color: var(--tts-primary-bg-hover, #0056b3);
  border-color: var(--tts-primary-border-hover, #0056b3);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 123, 255, 0.2);
}

/* Color Variants - Secondary */
.tts-button--secondary {
  background-color: var(--tts-secondary-bg, #f8f9fa);
  color: var(--tts-secondary-text, #495057);
  border: 1px solid var(--tts-secondary-border, #dee2e6);
}

.tts-button--secondary:hover:not(:disabled) {
  background-color: var(--tts-secondary-bg-hover, #e9ecef);
  border-color: var(--tts-secondary-border-hover, #adb5bd);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* State-specific Styles */
.tts-button--loading {
  pointer-events: none;
}

.tts-button--playing {
  border-color: var(--tts-playing-border, #dc3545) !important;
}

.tts-button--primary.tts-button--playing {
  background-color: var(--tts-playing-bg, #dc3545);
}

.tts-button--error {
  border-color: var(--tts-error-border, #dc3545) !important;
}

.tts-button--primary.tts-button--error {
  background-color: var(--tts-error-bg, #dc3545);
}

.tts-button--error:hover:not(:disabled) {
  transform: scale(1.05);
}

/* Disabled State */
.tts-button--disabled {
  opacity: 0.6;
  cursor: not-allowed;
  pointer-events: none;
}

/* Icon Container */
.icon-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* TTS Icon */
.tts-icon {
  transition: all 0.2s ease;
  flex-shrink: 0;
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

/* Progress Ring */
.progress-ring {
  position: absolute;
  top: -2px;
  left: -2px;
  z-index: 1;
  pointer-events: none;
}

.progress-ring-progress {
  transition: stroke-dashoffset 0.3s ease;
  stroke-linecap: round;
}

.progress-ring--animated .progress-ring-progress {
  animation: progress-pulse 2s ease-in-out infinite;
}

@keyframes progress-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Label */
.tts-label {
  font-weight: 500;
  user-select: none;
}

/* Hover Effects */
.tts-button--hovered .tts-icon {
  transform: scale(1.1);
}

/* Focus visible for accessibility */
.tts-button:focus-visible {
  outline: 2px solid var(--focus-color, #007bff);
  outline-offset: 2px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .tts-button--lg {
    padding: 6px 10px;
    min-height: 36px;
    font-size: 15px;
  }
  
  .tts-button--md {
    padding: 5px 7px;
    min-height: 30px;
    font-size: 13px;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .tts-button {
    border-width: 2px;
  }
  
  .progress-ring-background,
  .progress-ring-progress {
    stroke-width: 2;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .tts-button,
  .tts-icon,
  .progress-ring-progress {
    transition: none;
  }
  
  .loading-spin {
    animation: none;
  }
  
  .progress-ring--animated .progress-ring-progress {
    animation: none;
  }
}
</style>