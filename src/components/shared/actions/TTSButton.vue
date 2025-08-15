<template>
  <button
    type="button"
    class="action-button tts-button"
    :class="[
      `size-${size}`,
      `variant-${variant}`,
      { 'disabled': !canSpeak, 'playing': isPlaying }
    ]"
    :disabled="!canSpeak"
    :title="dynamicTitle"
    :aria-label="ariaLabel"
    @click="handleTTS"
  >
    <img 
      :src="iconSrc" 
      :alt="iconAlt"
      class="button-icon"
      :class="{ 'spinning': isPlaying }"
    />
    <span v-if="showLabel" class="button-label">{{ dynamicLabel }}</span>
    
    <!-- Playing indicator -->
    <div v-if="isPlaying && showPlayingIndicator" class="playing-indicator">
      <div class="wave"></div>
      <div class="wave"></div>
      <div class="wave"></div>
    </div>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useTTSSmart } from '@/composables/useTTSSmart.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'

// Scoped logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TTSButton')

// Props
const props = defineProps({
  text: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'auto'
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
    default: 'Play text'
  },
  stopTitle: {
    type: String,
    default: 'Stop playing'
  },
  ariaLabel: {
    type: String,
    default: 'Play text to speech'
  },
  iconAlt: {
    type: String,
    default: 'Play'
  },
  label: {
    type: String,
    default: 'Play'
  },
  stopLabel: {
    type: String,
    default: 'Stop'
  },
  showLabel: {
    type: Boolean,
    default: false
  },
  showPlayingIndicator: {
    type: Boolean,
    default: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['speaking', 'stopped', 'tts-failed'])

// Composables
const { speak, stop, isPlaying } = useTTSSmart()

// Computed
const canSpeak = computed(() => {
  return !props.disabled && props.text && props.text.trim().length > 0
})

const dynamicTitle = computed(() => {
  return isPlaying.value ? props.stopTitle : props.title
})

const dynamicLabel = computed(() => {
  return isPlaying.value ? props.stopLabel : props.label
})

const iconSrc = computed(() => {
  return '/icons/speaker.png'
})

// Methods
const handleTTS = async () => {
  if (!canSpeak.value) return
  
  // Log click event
  logger.debug('🔊 TTS button clicked!', { 
    text: props.text.slice(0, 20) + (props.text.length > 20 ? '...' : ''),
    language: props.language,
    source: 'Vue TTSButton'
  })
  
  try {
    if (isPlaying.value) {
      logger.debug('[TTSButton] Stopping TTS')
      await stop()
      emit('stopped')
    } else {
      logger.debug('[TTSButton] Starting TTS for text:', props.text.substring(0, 50) + '...')
      emit('speaking', { text: props.text, language: props.language })
      await speak(props.text, props.language)
    }
  } catch (error) {
    emit('tts-failed', error)
    logger.error('[TTSButton] TTS error:', error)
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

.action-button.playing {
  background-color: rgba(0, 120, 255, 0.1);
}

/* Size variants */
.size-small {
  padding: 4px;
  min-width: 24px;
  min-height: 24px;
}

.size-small .button-icon {
  width: 16px;
  height: 16px;
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
  transition: transform 0.3s ease;
}

.button-icon.spinning {
  animation: spin 2s linear infinite;
}

.button-label {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

/* Playing indicator */
.playing-indicator {
  position: absolute;
  top: -8px;
  right: -8px;
  display: flex;
  gap: 1px;
}

.wave {
  width: 2px;
  height: 8px;
  background: #007AFF;
  border-radius: 1px;
  animation: wave 1s ease-in-out infinite;
}

.wave:nth-child(2) {
  animation-delay: 0.1s;
}

.wave:nth-child(3) {
  animation-delay: 0.2s;
}

/* Animations */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes wave {
  0%, 40%, 100% {
    transform: scaleY(0.4);
  }
  20% {
    transform: scaleY(1);
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .action-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  
  .action-button.playing {
    background-color: rgba(0, 120, 255, 0.2);
  }
  
  .variant-standalone {
    border-color: rgba(255, 255, 255, 0.2);
    background-color: rgba(0, 0, 0, 0.9);
  }
  
  .wave {
    background: #1E90FF;
  }
}
</style>
