<template>
  <!-- Small loading window -->
  <div
    v-if="currentSize === 'small'"
    ref="windowElement"
    class="ti-window aiwc-selection-popup-host ti-loading-window"
    :class="[theme, { 'visible': isVisible, 'is-dragging': isPositionDragging }]"
    :style="windowStyle"
    data-translate-ui="true"
    @mousedown.stop
    @click.stop
  >
    <img 
      :src="loadingGifUrl"
      alt="Loading..."
      class="loading-gif"
      style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 24px; height: 24px;"
    >
  </div>

  <!-- Normal translation window -->
  <div
    v-else
    ref="windowElement"
    class="ti-window aiwc-selection-popup-host normal-window"
    :class="[theme, { 'visible': isVisible, 'is-dragging': isPositionDragging }]"
    :style="windowStyle"
    data-translate-ui="true"
    @mousedown.stop
    @click.stop
  >
    <div
      class="ti-window-header"
      @mousedown="handleStartDrag"
    >
      <div class="ti-header-actions">
        <button
          class="ti-action-btn"
          title="Copy translation"
          @click.stop="handleCopy"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
            />
          </svg>
        </button>
        <button
          class="ti-action-btn ti-smart-tts-btn"
          :class="{ 'ti-original-mode': ttsMode === 'original' }"
          :disabled="!hasTTSContent"
          :title="getEnhancedTTSButtonTitle"
          @click.stop="handleSmartTTS"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            class="ti-smart-tts-icon"
            :class="{ 'ti-original-icon': ttsMode === 'original' }"
          >
            <path
              v-if="!isSpeaking"
              fill="currentColor"
              :d="ttsMode === 'original' ? originalTextTTSIcon : translatedTextTTSIcon"
            />
            <path
              v-else
              fill="currentColor"
              d="M6 6h12v12H6z"
            />
          </svg>
        </button>
        <button
          class="ti-action-btn"
          :class="{ 'ti-original-visible': showOriginal }"
          :title="getOriginalButtonTitle"
          @click.stop="toggleShowOriginal"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8s8 3.58 8 8s-3.58 8-8 8zm-2-9.41V12h2.59L15 14.41V16h-4v-1.59L8.59 12H7v-2h3.59L13 7.59V6h4v1.59L14.41 10H12v.59z"
            />
          </svg>
        </button>
      </div>
      <div class="ti-header-close">
        <button
          class="ti-action-btn"
          title="Close"
          @click.stop="handleClose"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="ti-window-body">
      <!-- Show Original Text Section with smooth animation -->
      <Transition name="ti-original-text" appear>
        <div
          v-if="showOriginal && !isLoading"
          class="ti-original-text-section"
        >
          <div class="ti-original-text">
            {{ originalText }}
          </div>
        </div>
      </Transition>
      
      <!-- Translation Display Section -->
      <TranslationDisplay
        :content="translatedText"
        :is-loading="isLoading"
        :error="errorMessage"
        :mode="'compact'"
        :placeholder="'Translation will appear here...'"
        :target-language="props.targetLanguage"
        :show-fade-in-animation="true"
        :enable-markdown="true"
        :show-toolbar="false"
        :show-copy-button="false"
        :show-tts-button="false"
        :can-retry="!!errorMessage"
        :on-retry="handleRetry"
        class="ti-window-translation-display"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { usePositioning } from '@/composables/ui/usePositioning.js';
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js';
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue';
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js';
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';

const props = defineProps({
  id: { type: String, required: true },
  position: { type: Object, default: () => ({ x: 0, y: 0 }) },
  selectedText: { type: String, default: '' },
  initialTranslatedText: { type: String, default: '' },
  theme: { type: String, default: 'light' },
  isLoading: { type: Boolean, default: false },
  initialSize: { type: String, default: 'normal' }, // 'small' or 'normal'
  targetLanguage: { type: String, default: 'auto' } // Add target language prop
});

const emit = defineEmits(['close', 'speak']);
useMessaging('content');

// TTS functionality with unified composable
const tts = useTTSSmart();

// Logger
const logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, `TranslationWindow:${props.id}`);

// Resource tracker for memory management
const tracker = useResourceTracker(`translation-window-${props.id}`);

// State
const isLoading = computed(() => {
  const loading = props.isLoading || !props.initialTranslatedText;
  logger.debug('Loading state:', {
    propsIsLoading: props.isLoading,
    hasInitialText: !!props.initialTranslatedText,
    initialTextLength: props.initialTranslatedText?.length || 0,
    computed: loading
  });
  return loading;
});

const isVisible = ref(false); // Start as not visible
const currentSize = ref(props.initialSize); // Track current size
const translatedText = computed(() => props.initialTranslatedText);
const originalText = ref(props.selectedText);
const errorMessage = ref('');
const isSpeaking = computed(() => tts.ttsState.value === 'playing');

// Enhanced TTS mode detection and smart text selection
const ttsMode = computed(() => {
  return showOriginal.value ? 'original' : 'translated';
});

const hasTTSContent = computed(() => {
  const hasOriginal = showOriginal.value && originalText.value && originalText.value.trim().length > 0;
  const hasTranslated = !showOriginal.value && translatedText.value && translatedText.value.trim().length > 0;
  return hasOriginal || hasTranslated;
});

const currentTTSText = computed(() => {
  if (ttsMode.value === 'original') {
    return originalText.value || '';
  }
  return translatedText.value || '';
});

const getTTSButtonTitle = computed(() => {
  if (!hasTTSContent.value) {
    return 'No text available for speech';
  }

  if (tts.ttsState.value === 'playing') {
    return 'Stop TTS';
  }

  if (ttsMode.value === 'original') {
    return 'Speak original text';
  }

  return 'Speak translation';
});

// Enhanced TTS button title with more detailed guidance
const getEnhancedTTSButtonTitle = computed(() => {
  if (!hasTTSContent.value) {
    return 'No text available for speech';
  }

  if (tts.ttsState.value === 'playing') {
    return 'Stop speaking (Click to stop)';
  }

  if (ttsMode.value === 'original') {
    return '🔊 Speak ORIGINAL text (Show original first, then click this button)';
  }

  return '🔊 Speak TRANSLATION (Current mode: translation)';
});

// Enhanced original button title with TTS hint
const getOriginalButtonTitle = computed(() => {
  if (showOriginal.value) {
    return 'Hide Original Text (TTS button now speaks original text)';
  }
  return 'Show Original Text (Then use speaker button to listen to original)';
});

// TTS icon paths for different modes
const originalTextTTSIcon = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z";
const translatedTextTTSIcon = "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";

// Add retry handler for TranslationDisplay
const handleRetry = () => {
  // Emit retry event or perform retry logic
  logger.info('Retry requested for translation window:', props.id);
};
const showOriginal = ref(false);

// Computed dimensions for positioning - now handled by CSS classes
const currentWidth = computed(() => currentSize.value === 'small' ? 60 : null); // null = use CSS
const currentHeight = computed(() => currentSize.value === 'small' ? 40 : null); // null = use CSS

// Use positioning composable with drag enabled
const {
  currentPosition,
  isDragging: isPositionDragging,
  positionStyle,
  startDrag,
  updatePosition,
  cleanup: cleanupPositioning
} = usePositioning(props.position, {
  defaultWidth: currentWidth.value || 240, // fallback for normal windows
  defaultHeight: currentHeight.value || 180, // fallback for normal windows
  enableDragging: true
});

// Watch for prop changes and recalculate position with correct dimensions
watch(() => props.position, (newPos) => {
  updatePosition(newPos, {
    width: currentWidth.value || 240,
    height: currentHeight.value || 180
  });
});

watch(() => props.initialSize, (newSize) => {
  currentSize.value = newSize;

  if (newSize === 'normal') {
    // Wait for the DOM to update to the normal window
    nextTick(() => {
      if (windowElement.value) {
        const { offsetWidth, offsetHeight } = windowElement.value;
        updatePosition(currentPosition.value, {
          width: offsetWidth,
          height: offsetHeight
        });
      }
    });
  } else {
    // For 'small' size, we know the dimensions
    updatePosition(currentPosition.value, {
      width: currentWidth.value,
      height: currentHeight.value
    });
  }
});

// Watch for original text visibility changes and log TTS mode updates
watch(() => showOriginal.value, (newShowOriginal, oldShowOriginal) => {
  if (newShowOriginal !== oldShowOriginal) {
    logger.debug(`[TranslationWindow ${props.id}] Original text visibility changed:`, {
      oldShowOriginal,
      newShowOriginal,
      newTTSMode: ttsMode.value,
      availableText: currentTTSText.value ? 'Available' : 'Not available'
    });
  }
});

// Watch TTS state changes for debugging
watch(() => tts.ttsState.value, (newState, oldState) => {
  if (newState !== oldState) {
    logger.debug(`[TranslationWindow ${props.id}] TTS state changed:`, {
      oldState,
      newState,
      currentMode: ttsMode.value,
      hasContent: hasTTSContent.value
    });
  }
});


// Loading GIF URL using browser extension API
const loadingGifUrl = computed(() => {
  try {
    return browser.runtime.getURL('icons/ui/loading.gif');
  } catch (error) {
    logger.warn('[TranslationWindow] Failed to get loading GIF URL:', error);
    return '';
  }
});

// Computed Style for positioning only - dimensions handled by CSS classes
const windowStyle = computed(() => {
  return {
    ...positionStyle.value
    // All positioning, display, and visibility handled by global CSS
    // All width, height, minWidth, minHeight, borderRadius handled by CSS classes
  };
});


// When the component is mounted, start invisible and then animate in.
onMounted(() => {
  // Use requestAnimationFrame to ensure the transition is applied after the initial render
  requestAnimationFrame(() => {
    isVisible.value = true;
  });
});

onUnmounted(() => {
  // Cleanup TTS when window is dismissed
  logger.debug(`[TranslationWindow ${props.id}] Window unmounting - stopping TTS and cleaning up`);
  
  // Stop any ongoing TTS
  tts.stopAll().catch(error => {
    logger.warn(`[TranslationWindow ${props.id}] Failed to stop TTS during cleanup:`, error);
  });
  
  // Cleanup positioning composable
  cleanupPositioning();
});

// Methods
const handleClose = () => emit('close', props.id);

const toggleShowOriginal = () => {
  showOriginal.value = !showOriginal.value;
};

// Event handlers that are no longer needed since we removed TranslationDisplay actions
// Copy and TTS are now handled only in the header

// Header button handlers
const handleCopy = async () => {
  if (!translatedText.value || translatedText.value.trim().length === 0) {
    logger.warn(`[TranslationWindow ${props.id}] No translation text to copy`);
    return;
  }

  try {
    await navigator.clipboard.writeText(translatedText.value);
    logger.debug(`[TranslationWindow ${props.id}] Translation copied to clipboard`);
  } catch (error) {
    logger.error(`[TranslationWindow ${props.id}] Failed to copy translation:`, error);
  }
};


// Enhanced smart TTS handler that supports both original and translated text
const handleSmartTTS = async () => {
  if (!hasTTSContent.value) {
    logger.warn(`[TranslationWindow ${props.id}] No text available for TTS in ${ttsMode.value} mode`);
    return;
  }

  try {
    const textToSpeak = currentTTSText.value;

    if (tts.ttsState.value === 'playing') {
      // Stop TTS regardless of mode
      await tts.stop();
      logger.debug(`[TranslationWindow ${props.id}] TTS stopped in ${ttsMode.value} mode`);
    } else {
      // Start TTS with appropriate text and language detection
      const result = await tts.speak(textToSpeak, 'auto');
      if (result) {
        logger.debug(`[TranslationWindow ${props.id}] TTS started for ${ttsMode.value} text`);
      } else {
        logger.warn(`[TranslationWindow ${props.id}] TTS failed to start for ${ttsMode.value} text`);
      }
    }
  } catch (error) {
    logger.error(`[TranslationWindow ${props.id}] Smart TTS failed in ${ttsMode.value} mode:`, error);
  }
};


// Enhanced drag handling with global state management
const windowElement = ref(null);

const handleStartDrag = (event) => {
  // Set global drag flags for outside click protection
  logger.debug('[TranslationWindow] Setting drag flag to TRUE');
  window.__TRANSLATION_WINDOW_IS_DRAGGING = true;
  
  // Use composable's drag handler
  startDrag(event);
  
  // Add our custom cleanup to mouseup
  const customStopDrag = () => {
    logger.debug('[TranslationWindow] Setting drag flag to FALSE');
    window.__TRANSLATION_WINDOW_IS_DRAGGING = false;
    window.__TRANSLATION_WINDOW_JUST_DRAGGED = true;
    setTimeout(() => {
      window.__TRANSLATION_WINDOW_JUST_DRAGGED = false;
    }, 300);
  };
  
  tracker.addEventListener(document, 'mouseup', customStopDrag, { once: true });
};

</script>

<style scoped>
/* Remove hardcoded width - now handled by global CSS classes */

/* Theme styles moved to enhanced section below */

.ti-window-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 8px 12px !important;
  cursor: move !important;
  user-select: none !important;
}

/* Theme-specific styles for light mode */
.translation-window.light .ti-window-header {
  background-color: #f7f7f7 !important;
  border-bottom: 1px solid #e8e8e8 !important;
}

.translation-window.light .ti-action-btn {
  background-color: #f0f0f0 !important;
  color: #555 !important;
}

.translation-window.light .ti-action-btn:hover {
  background-color: #e5e5e5 !important;
}

/* Theme-specific styles for dark mode */
.translation-window.dark .ti-window-header {
  background-color: #333333 !important;
  border-bottom: 1px solid #424242 !important;
}

.translation-window.dark .ti-action-btn {
  background-color: #424242 !important;
  color: #e0e0e0 !important;
}

.translation-window.dark .ti-action-btn:hover {
  background-color: #555555 !important;
}

.ti-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ti-header-close {
  display: flex;
  align-items: center;
}

.ti-action-btn {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 28px !important;
  height: 28px !important;
  border: none !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  transition: background-color 0.2s ease !important;
}

.ti-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.ti-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Original button visibility indicator */
.ti-action-btn.ti-original-visible {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%) !important;
  border: 1px solid rgba(59, 130, 246, 0.3) !important;
  color: #1e40af !important;
}

.translation-window.dark .ti-action-btn.ti-original-visible {
  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%) !important;
  border: 1px solid rgba(59, 130, 246, 0.4) !important;
  color: #93c5fd !important;
}

/* Smart TTS Button Styles */
.ti-smart-tts-btn {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
  position: relative;
}

.ti-smart-tts-btn.ti-original-mode {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: 1px solid rgba(102, 126, 234, 0.3) !important;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3) !important;
}

.ti-smart-tts-btn:not(.ti-original-mode) {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%) !important;
  border: 1px solid rgba(79, 172, 254, 0.3) !important;
  box-shadow: 0 2px 8px rgba(79, 172, 254, 0.3) !important;
}

.ti-smart-tts-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
}

.ti-smart-tts-btn.ti-original-mode:hover {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5) !important;
}

.ti-smart-tts-btn:not(.ti-original-mode):hover {
  box-shadow: 0 4px 12px rgba(79, 172, 254, 0.5) !important;
}

/* Smart TTS Icon Styles */
.ti-smart-tts-icon {
  transition: all 0.2s ease !important;
}

.ti-smart-tts-icon.ti-original-icon {
  filter: brightness(1.1);
}

/* Theme-specific hover effects */
.translation-window.light .ti-action-btn:hover {
  background-color: #f0f0f0;
}

.translation-window.dark .ti-action-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

/* Light theme adjustments for smart TTS button */
.translation-window.light .ti-smart-tts-btn.ti-original-mode {
  background: linear-gradient(135deg, #5e72e4 0%, #667eea 100%) !important;
}

.translation-window.light .ti-smart-tts-btn:not(.ti-original-mode) {
  background: linear-gradient(135deg, #2196f3 0%, #4facfe 100%) !important;
}

/* Dark theme adjustments for smart TTS button */
.translation-window.dark .ti-smart-tts-btn.ti-original-mode {
  background: linear-gradient(135deg, #7c3aed 0%, #667eea 100%) !important;
}

.translation-window.dark .ti-smart-tts-btn:not(.ti-original-mode) {
  background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%) !important;
}


.ti-window-body {
  padding: 16px !important;
  min-height: 100px !important;
  display: flex !important;
  flex-direction: column !important;
}

/* Original text section styles are now handled in global CSS for Shadow DOM compatibility */

/* Translation display with modern containment */
.ti-window-translation-display {
  flex: 1;
  min-height: 80px;
  position: relative;

  /* Modern containment approach */
  contain: layout style;
  overflow: clip; /* Modern clipping */
  min-width: 0; /* Allow flex shrinking */
  width: 100%; /* Take full width */
}

.window-translation-display :deep(.translation-content) {
  border: none;
  background: transparent;
  padding-top: 8px;
  font-size: 14px;
  line-height: 1.5;

  /* Natural text wrapping */
  overflow-wrap: break-word;
  hyphens: auto; /* Enable hyphenation */

  /* Constrain to container */
  width: 100%;
  overflow-x: clip;
}


/* ActionToolbar size adjustments for translation window - now handled by TranslationDisplay */
.window-translation-display :deep(.display-toolbar) {
  top: 8px;
  right: 8px;
  left: auto;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Dark theme styles for original text section are now handled in global CSS for Shadow DOM compatibility */


/* Loading window specific styles */
.translation-window.loading-window {
  width: 60px !important;
  height: 40px !important;
  min-width: 60px !important;
  min-height: 40px !important;
  max-width: 60px !important;
  max-height: 40px !important;
  border-radius: 20px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #fff !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
  position: relative !important;
}


.loading-gif {
  transition: opacity 0.1s ease;
}

/* Dark theme for loading window */
.translation-window.loading-window.dark {
  background: #333 !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}

/* Transition animations for original text section are now handled in global CSS for Shadow DOM compatibility */

/* Component-specific styles only - base window styles handled by global CSS */

</style>