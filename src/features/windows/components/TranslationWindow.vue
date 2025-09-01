<template>
  <!-- Small loading window -->
  <div 
    v-if="currentSize === 'small'"
    ref="windowElement"
    class="translation-window aiwc-selection-popup-host loading-window"
    :class="[theme, { 'visible': isVisible, 'is-dragging': isPositionDragging }]"
    :style="windowStyle"
    @mousedown.stop
    @click.stop
  >
    <img 
      :src="loadingGifUrl"
      alt="Loading..."
      class="loading-gif"
      style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 24px; height: 24px;"
    />
  </div>

  <!-- Normal translation window -->
  <div 
    v-else
    ref="windowElement"
    class="translation-window aiwc-selection-popup-host normal-window"
    :class="[theme, { 'visible': isVisible, 'is-dragging': isPositionDragging }]"
    :style="windowStyle"
    @mousedown.stop
    @click.stop
  >
    <div class="window-header" @mousedown="handleStartDrag">
      <div class="header-actions">
        <button class="action-btn" @click.stop="handleCopy" title="Copy translation">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
        </button>
        <button 
          class="action-btn" 
          @click.stop="handleTTS" 
          :disabled="!translatedText || translatedText.trim().length === 0"
          :title="isSpeaking ? 'Stop TTS' : 'Play TTS'"
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path v-if="!isSpeaking" fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            <path v-else fill="currentColor" d="M6 6h12v12H6z"/>
          </svg>
        </button>
        <button class="action-btn" @click.stop="toggleShowOriginal" title="Show/Hide Original Text">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8s8 3.58 8 8s-3.58 8-8 8zm-2-9.41V12h2.59L15 14.41V16h-4v-1.59L8.59 12H7v-2h3.59L13 7.59V6h4v1.59L14.41 10H12v.59z"/>
          </svg>
        </button>
      </div>
      <div class="header-close">
        <button class="action-btn" @click.stop="handleClose" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="window-body">
      <!-- Show Original Text Section -->
      <div v-if="showOriginal && !isLoading" class="original-text-section">
        <div class="original-label">Original:</div>
        <div class="original-text">{{ originalText }}</div>
      </div>
      
      <!-- Translation Display Section -->
      <TranslationDisplay
        :content="translatedText"
        :is-loading="isLoading"
        :error="errorMessage"
        :mode="'compact'"
        :placeholder="'Translation will appear here...'"
        :target-language="'auto'"
        :show-fade-in-animation="true"
        :enable-markdown="true"
        :show-toolbar="false"
        :show-copy-button="false"
        :show-tts-button="false"
        :can-retry="!!errorMessage"
        :on-retry="handleRetry"
        class="window-translation-display"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { usePositioning } from '@/composables/ui/usePositioning.js';
import { useTTSGlobal } from '@/features/tts/core/TTSGlobalManager.js';
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js';
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue';
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js';
import { isContextError } from '@/utils/core/extensionContext.js';
import browser from 'webextension-polyfill';

const props = defineProps({
  id: { type: String, required: true },
  position: { type: Object, default: () => ({ x: 0, y: 0 }) },
  selectedText: { type: String, default: '' },
  initialTranslatedText: { type: String, default: '' },
  theme: { type: String, default: 'light' },
  isLoading: { type: Boolean, default: false },
  initialSize: { type: String, default: 'normal' } // 'small' or 'normal'
});

const emit = defineEmits(['close', 'speak']);
const { sendMessage } = useMessaging('content');

// TTS Global Manager for windows-manager lifecycle
const ttsGlobal = useTTSGlobal({ 
  type: 'windows-manager', 
  name: `TranslationWindow-${props.id}`
});

// TTS Smart for actual TTS functionality with proper state management
const tts = useTTSSmart();

// State  
const isLoading = computed(() => {
  const loading = props.isLoading || !props.initialTranslatedText;
  console.log(`[TranslationWindow ${props.id}] Loading state:`, {
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

// Add retry handler for TranslationDisplay
const handleRetry = () => {
  // Emit retry event or perform retry logic
  console.log('Retry requested for translation window:', props.id);
};
const showOriginal = ref(false);

// Computed dimensions for positioning
const currentWidth = computed(() => currentSize.value === 'small' ? 60 : 350);
const currentHeight = computed(() => currentSize.value === 'small' ? 40 : 180);

// Use positioning composable with drag enabled
const {
  currentPosition,
  isDragging: isPositionDragging,
  positionStyle,
  startDrag,
  updatePosition,
  cleanup: cleanupPositioning
} = usePositioning(props.position, {
  defaultWidth: currentWidth.value,
  defaultHeight: currentHeight.value,
  enableDragging: true
});

// Watch for prop changes and recalculate position with correct dimensions
watch(() => props.position, (newPos) => {
  updatePosition(newPos, {
    width: currentWidth.value,
    height: currentHeight.value
  });
});

watch(() => props.initialSize, (newSize) => {
  currentSize.value = newSize;
  // Recalculate position with new dimensions to ensure it stays within viewport
  updatePosition(currentPosition.value, {
    width: currentWidth.value,
    height: currentHeight.value
  });
});


// Loading GIF URL using browser extension API
const loadingGifUrl = computed(() => {
  try {
    return browser.runtime.getURL('icons/loading-128.gif');
  } catch (error) {
    console.warn('[TranslationWindow] Failed to get loading GIF URL:', error);
    // Fallback for development
    return '/src/assets/icons/loading-128.gif';
  }
});

// Computed Style for positioning only (no opacity/transform - handled by CSS classes)
const windowStyle = computed(() => {
  const isSmall = currentSize.value === 'small';
  
  return {
    ...positionStyle.value,
    width: isSmall ? '60px' : '350px',
    height: isSmall ? '40px' : 'auto',
    minWidth: isSmall ? '60px' : '300px',
    minHeight: isSmall ? '40px' : '120px',
    borderRadius: isSmall ? '20px' : '8px'
  };
});


// When the component is mounted, start invisible and then animate in.
onMounted(() => {
  // Register TTS instance with stop callback
  ttsGlobal.register(async () => {
    console.log(`[TranslationWindow ${props.id}] TTS cleanup callback - window closing`)
    // Use direct message to background instead of calling stopAll() to avoid recursion
    try {
      await sendMessage({
        action: 'GOOGLE_TTS_STOP_ALL',
        data: { source: 'translation-window-cleanup', windowId: props.id }
      })
    } catch (error) {
      // Handle context errors silently as they're expected during extension reload
      if (isContextError(error)) {
        console.debug(`[TranslationWindow ${props.id}] Extension context invalidated during cleanup - expected during extension reload`)
      } else {
        console.debug(`[TranslationWindow ${props.id}] Failed to stop TTS during cleanup:`, error)
      }
    }
  });

  // TTS global manager is used for coordination between multiple windows/components

  // Use requestAnimationFrame to ensure the transition is applied after the initial render
  requestAnimationFrame(() => {
    isVisible.value = true;
  });
});

onUnmounted(() => {
  // Cleanup TTS when window is dismissed
  console.log(`[TranslationWindow ${props.id}] Window unmounting - stopping TTS and cleaning up`);
  
  // Unregister from TTS global manager (this will automatically trigger cleanup)
  ttsGlobal.unregister();
  
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
    console.warn(`[TranslationWindow ${props.id}] No translation text to copy`);
    return;
  }

  try {
    await navigator.clipboard.writeText(translatedText.value);
    console.log(`[TranslationWindow ${props.id}] Translation copied to clipboard`);
  } catch (error) {
    console.error(`[TranslationWindow ${props.id}] Failed to copy translation:`, error);
  }
};

const handleTTS = async () => {
  if (!translatedText.value || translatedText.value.trim().length === 0) {
    console.warn(`[TranslationWindow ${props.id}] No translation text for TTS`);
    return;
  }

  try {
    if (tts.ttsState.value === 'playing') {
      // Stop TTS
      await tts.stop();
      console.log(`[TranslationWindow ${props.id}] TTS stopped`);
    } else {
      // Start TTS - register with global manager then speak
      await ttsGlobal.startTTS();
      const result = await tts.speak(translatedText.value, 'auto');
      if (result) {
        console.log(`[TranslationWindow ${props.id}] TTS started`);
      } else {
        console.warn(`[TranslationWindow ${props.id}] TTS failed to start`);
      }
    }
  } catch (error) {
    console.error(`[TranslationWindow ${props.id}] TTS failed:`, error);
  }
};


// Enhanced drag handling with global state management
const windowElement = ref(null);

const handleStartDrag = (event) => {
  // Set global drag flags for outside click protection
  console.log('[TranslationWindow] Setting drag flag to TRUE');
  window.__TRANSLATION_WINDOW_IS_DRAGGING = true;
  
  // Use composable's drag handler
  startDrag(event);
  
  // Add our custom cleanup to mouseup
  const customStopDrag = () => {
    console.log('[TranslationWindow] Setting drag flag to FALSE');
    window.__TRANSLATION_WINDOW_IS_DRAGGING = false;
    window.__TRANSLATION_WINDOW_JUST_DRAGGED = true;
    setTimeout(() => {
      window.__TRANSLATION_WINDOW_JUST_DRAGGED = false;
    }, 300);
  };
  
  document.addEventListener('mouseup', customStopDrag, { once: true });
};

</script>

<style scoped>
.translation-window {
  width: 350px !important;
  border-radius: 8px !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15) !important;
  display: flex !important;
  flex-direction: column !important;
  font-family: 'Vazirmatn', sans-serif !important;
  overflow: hidden !important;
  will-change: width, height, border-radius;
}

/* Theme styles moved to enhanced section below */

.window-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 8px 12px !important;
  cursor: move !important;
  user-select: none !important;
}

/* Theme-specific styles for light mode */
.translation-window.light .window-header {
  background-color: #f7f7f7 !important;
  border-bottom: 1px solid #e8e8e8 !important;
}

.translation-window.light .action-btn {
  background-color: #f0f0f0 !important;
  color: #555 !important;
}

.translation-window.light .action-btn:hover {
  background-color: #e5e5e5 !important;
}

/* Theme-specific styles for dark mode */
.translation-window.dark .window-header {
  background-color: #333333 !important;
  border-bottom: 1px solid #424242 !important;
}

.translation-window.dark .action-btn {
  background-color: #424242 !important;
  color: #e0e0e0 !important;
}

.translation-window.dark .action-btn:hover {
  background-color: #555555 !important;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-close {
  display: flex;
  align-items: center;
}

.action-btn {
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

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Theme-specific hover effects */
.translation-window.light .action-btn:hover {
  background-color: #f0f0f0;
}

.translation-window.dark .action-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}


.window-body {
  padding: 16px !important;
  min-height: 100px !important;
  display: flex !important;
  flex-direction: column !important;
}

/* Original text section styling */
.original-text-section {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.original-label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.original-text {
  font-size: 13px;
  line-height: 1.4;
  color: #555;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* Translation display integration */
.window-translation-display {
  flex: 1;
  min-height: 80px;
  position: relative;
}

.window-translation-display :deep(.translation-content) {
  border: none;
  background: transparent;
  padding: 8px 0 0 0;
  font-size: 14px;
  line-height: 1.5;
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

/* Dark theme adjustments */
.translation-window.dark .original-text-section {
  border-bottom-color: rgba(255, 255, 255, 0.2);
}

.translation-window.dark .original-label {
  color: #aaa;
}

.translation-window.dark .original-text {
  color: #ccc;
}

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

/* Visibility and animation control */
.translation-window {
  /* Base styles - Force important to override Shadow DOM resets */
  background: #fff !important;
  border: 1px solid #e8e8e8 !important;
  border-radius: 8px !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15) !important;
  display: flex !important;
  flex-direction: column !important;
  font-family: 'Vazirmatn', sans-serif !important;
  position: relative !important;
  
  /* Animation styles */
  opacity: 0 !important;
  transform: scale(0.95) !important;
  transition: opacity 0.2s ease, transform 0.2s ease !important;
  visibility: hidden !important;
}

.translation-window.visible {
  opacity: 0.9 !important;
  transform: scale(1) !important;
  visibility: visible !important;
}

/* Base theme styles - Light Mode */
.translation-window.light {
  background-color: #ffffff !important;
  border: 1px solid #e8e8e8 !important;
  color: #2c3e50 !important;
}

/* Base theme styles - Dark Mode */
.translation-window.dark {
  background-color: #2d2d2d !important;
  border: 1px solid #424242 !important;
  color: #e0e0e0 !important;
}

</style>