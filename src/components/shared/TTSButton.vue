<template>
  <BaseActionButton
    :size="size"
    :variant="variant"
    :disabled="disabled || (effectiveState === 'loading') || !text || !text.trim()"
    :title="buttonTitle"
    :label="buttonLabel"
    :show-label="showLabel"
    :custom-classes="ttsButtonClasses"
    @click="handleClick"
  >
    <template #icon>
      <!-- Icon Container -->
      <div class="ti-icon-container">
        <!-- Idle State Icon -->
        <svg
          v-if="effectiveState === 'idle'"
          class="ti-tts-icon"
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
          v-else-if="effectiveState === 'loading'"
          class="ti-tts-icon ti-loading-spin"
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
          v-else-if="effectiveState === 'playing'"
          class="ti-tts-icon"
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
          v-else-if="effectiveState === 'error'"
          class="ti-tts-icon ti-error-icon"
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
import { computed, watch, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import './TTSButton.scss'
import BaseActionButton from '@/features/text-actions/components/BaseActionButton.vue'
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { getLanguageNameFromCode } from '@/shared/config/languageConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TTSButton')

// i18n
const { t } = useI18n()

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

// Track the specific TTS request started by this button instance
const localTTSId = ref(null)

// Check if this specific button instance is currently responsible for the active TTS
const isThisButtonActive = computed(() => {
  // If system is in error state, and this was the last button to trigger it
  if (tts.ttsState.value === 'error' && tts.lastText.value === props.text) {
    return true
  }
  
  // Normal check via active ID
  return !!(localTTSId.value && tts.currentTTSId.value === localTTSId.value)
})

// The visual state for this specific button instance
const effectiveState = computed(() => {
  // If this button is currently waiting for its own request to start
  if (tts.ttsState.value === 'loading' && localTTSId.value?.startsWith('pending_')) {
    return 'loading'
  }

  // If this button is active (playing or error), show the global TTS state
  if (isThisButtonActive.value) {
    return tts.ttsState.value
  }
  
  // Otherwise, always show as idle
  return 'idle'
})

// Computed Properties
const ttsButtonClasses = computed(() => [
  'ti-tts-button',
  `ti-tts-button--${effectiveState.value}`,
  {
    'ti-tts-button--has-label': props.showLabel
  }
])

const buttonTitle = computed(() => {
  // Get readable language name if it's not 'auto'
  const displayLang = props.language && props.language !== 'auto' 
    ? getLanguageNameFromCode(props.language) 
    : '';
  
  // Capitalize first letter (e.g., 'english', 'persian')
  const langName = displayLang 
    ? displayLang.charAt(0).toUpperCase() + displayLang.slice(1) 
    : '';
    
  const langSuffix = langName ? ` (${langName})` : '';

  switch (effectiveState.value) {
    case 'idle':
      return t('action_speak_text') + langSuffix
    case 'loading':
      return t('window_loading_alt')
    case 'playing':
      return t('action_stop_speaking') + langSuffix
    case 'error':
      // Try to get localized message from errorType key
      if (tts.errorType.value) {
        const key = tts.errorType.value.startsWith('ERRORS_') ? tts.errorType.value : `ERRORS_${tts.errorType.value}`;
        const translated = t(key);
        if (translated && translated !== key) return translated;
      }
      return tts.errorMessage.value || t('ERRORS_UNKNOWN')
    default:
      return 'Text to speech'
  }
})

const buttonLabel = computed(() => {
  switch (effectiveState.value) {
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

  logger.debug(`[TTSButton] Clicked in state: ${effectiveState.value}, text length: ${props.text.length}`)

  try {
    let result = false

    // Use effectiveState to determine the action for this button
    switch (effectiveState.value) {
      case 'idle':
        // Generate a temporary ID or use a marker to stay active during speak()
        localTTSId.value = `pending_${Date.now()}`
        
        result = await tts.speak(props.text, props.language)
        
        if (result) {
          // Sync with the actual ID from the store after success
          localTTSId.value = tts.currentTTSId.value
          emit('tts-started', { text: props.text, language: props.language })
        } else {
          // Failure: we don't clear localTTSId yet, so isThisButtonActive can detect 'error' state
          logger.debug('[TTSButton] Speak failed, error state should be visible')
        }
        break

      case 'loading':
      case 'playing':
        // Stop current TTS
        result = await tts.stop()
        if (result) {
          localTTSId.value = null
          emit('tts-stopped')
        }
        break

      case 'error':
        // Priority: Use speak() with current text instead of rigid retry()
        // This allows user to change text/language and try again
        localTTSId.value = `pending_retry_${Date.now()}`
        result = await tts.speak(props.text, props.language)
        
        if (result) {
          localTTSId.value = tts.currentTTSId.value
          emit('tts-started', { text: props.text, language: props.language })
        } else {
          emit('tts-error', new Error(tts.errorMessage.value || 'TTS retry failed'))
        }
        break

      default:
        logger.warn('[TTSButton] Unknown effective state:', effectiveState.value)
        await tts.stop()
        localTTSId.value = null
        if (result) emit('tts-stopped')
    }
  } catch (error) {
    logger.error('[TTSButton] Action failed:', error)
    localTTSId.value = null
    emit('tts-error', error instanceof Error ? error : new Error(error?.message || 'TTS action failed'))
  }
}

// Watch for state changes and emit events
watch(() => tts.ttsState.value, (newState, oldState) => {
  if (oldState !== undefined) {
    // State changed - logged at TRACE level for detailed debugging
    // logger.debug('[TTSButton] State changed:', oldState, '→', newState)
    emit('state-changed', { 
      from: oldState, 
      to: newState,
      canStop: tts.canStop.value
    })
  }
})
</script>