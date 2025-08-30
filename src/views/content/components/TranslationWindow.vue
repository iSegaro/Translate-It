<template>
  <!-- Small loading window -->
  <div 
    v-if="currentSize === 'small'"
    ref="windowElement"
    class="translation-window aiwc-selection-popup-host loading-window"
    :class="[theme, { 'visible': isVisible }]"
    :style="windowStyle"
    @mousedown.stop
    @click.stop
  >
    <img 
      src="/src/assets/icons/loading-128.gif"
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
    :class="[theme, { 'visible': isVisible, 'is-dragging': isDragging }]"
    :style="windowStyle"
    @mousedown.stop
    @click.stop
  >
    <div class="window-header" @mousedown="handleStartDrag">
      <div class="header-actions">
        <button class="action-btn" @click.stop="handleCopy" title="Copy">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
        </button>
        <ActionToolbar
          :text="props.initialTranslatedText"
          :language="'auto'"
          mode="floating"
          position="inline"
          :visible="true"
          :show-copy="false"
          :show-paste="false"
          :show-tts="true"
          size="sm"
          variant="secondary"
          @tts-started="handleTTSStarted"
          @tts-stopped="handleTTSStopped"
          @tts-error="handleTTSError"
          class="header-action-toolbar"
        />
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
import { usePositioning } from '@/composables/usePositioning.js';
import { useTTSGlobal } from '@/composables/useTTSGlobal.js';
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue';
import ActionToolbar from '@/components/shared/actions/ActionToolbar.vue';
import { useMessaging } from '../../../messaging/composables/useMessaging';

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
const isDragging = ref(false);
const isSpeaking = ref(false);

// Add retry handler for TranslationDisplay
const handleRetry = () => {
  // Emit retry event or perform retry logic
  console.log('Retry requested for translation window:', props.id);
};
const showOriginal = ref(false);

// Use positioning composable with drag enabled
const {
  currentPosition,
  isDragging: isPositionDragging,
  positionStyle,
  startDrag,
  cleanup: cleanupPositioning
} = usePositioning(props.position, {
  defaultWidth: currentSize.value === 'small' ? 60 : 350,
  defaultHeight: currentSize.value === 'small' ? 40 : 180,
  enableDragging: true
});

// Watch for prop changes
watch(() => props.position, (newPos) => {
  currentPosition.value = { x: newPos.x || newPos.left || 0, y: newPos.y || newPos.top || 0 };
});

watch(() => props.initialSize, (newSize) => {
  currentSize.value = newSize;
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
      console.error(`[TranslationWindow ${props.id}] Failed to stop TTS during cleanup:`, error)
    }
  });

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

const handleCopy = () => {
  navigator.clipboard.writeText(props.initialTranslatedText);
};

// TTSButton event handlers - no need to emit to WindowsManager as TTSButton handles TTS itself
const handleTTSStarted = (data) => {
  console.log(`[TranslationWindow ${props.id}] TTS started:`, data.text.substring(0, 50) + '...');
  isSpeaking.value = true;
  // No emit - TTSButton handles TTS internally
};

const handleTTSStopped = () => {
  console.log(`[TranslationWindow ${props.id}] TTS stopped`);
  isSpeaking.value = false;
  // No emit - TTSButton handles TTS internally
};

const handleTTSError = (error) => {
  console.error(`[TranslationWindow ${props.id}] TTS error:`, error);
  isSpeaking.value = false;
  // No emit - TTSButton handles TTS internally
};

// Enhanced drag handling with global state management
const windowElement = ref(null);

const handleStartDrag = (event) => {
  // Set global drag flags for outside click protection
  window.__TRANSLATION_WINDOW_IS_DRAGGING = true;
  isDragging.value = true;
  
  // Use composable's drag handler
  startDrag(event);
  
  // Custom cleanup when drag ends
  const originalStopDrag = () => {
    isDragging.value = false;
    window.__TRANSLATION_WINDOW_IS_DRAGGING = false;
    window.__TRANSLATION_WINDOW_JUST_DRAGGED = true;
    setTimeout(() => {
      window.__TRANSLATION_WINDOW_JUST_DRAGGED = false;
    }, 300);
  };
  
  // Override the composable's stop handler temporarily
  const handleMouseUp = () => {
    originalStopDrag();
    document.removeEventListener('mouseup', handleMouseUp);
  };
  
  document.addEventListener('mouseup', handleMouseUp);
};

</script>

<style scoped>
.translation-window {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  min-width: 300px;
  max-width: 500px;
  overflow: hidden;
  will-change: width, height, border-radius;
}

/* Theme styles moved to enhanced section below */

.window-header {
  padding: 6px 8px;
  cursor: move;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 32px;
  border-bottom: 1px solid #e8e8e8;
}

/* Header theme styles */
.translation-window.light .window-header {
  background-color: #f7f7f7;
  border-bottom: 1px solid #e8e8e8;
}

.translation-window.dark .window-header {
  background-color: #34495e;
  border-bottom: 1px solid #566573;
}

.header-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.header-action-toolbar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* ActionToolbar integration in header */
.header-action-toolbar :deep(.action-toolbar) {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.header-action-toolbar :deep(.toolbar-left) {
  gap: 0 !important;
}

.header-action-toolbar :deep(.tts-button) {
  background: none !important;
  border: none !important;
  cursor: pointer !important;
  padding: 5px !important;
  transition: background 0.3s !important;
  border-radius: 3px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 26px !important;
  height: 26px !important;
  min-width: 26px !important;
  min-height: 26px !important;
  position: relative !important;
  /* Performance optimizations matching other modes */
  will-change: transform !important;
  backface-visibility: hidden !important;
  transform: translateZ(0) !important;
}

.header-action-toolbar :deep(.tts-button:hover) {
  background: rgba(255, 255, 255, 0.1) !important;
}

/* Progress ring optimizations for floating mode */
.header-action-toolbar :deep(.progress-ring) {
  will-change: transform !important;
  backface-visibility: hidden !important;
}

.header-action-toolbar :deep(.tts-icon) {
  will-change: transform !important;
}

.translation-window.light .header-action-toolbar :deep(.tts-button:hover) {
  background-color: #f0f0f0 !important;
}

.translation-window.dark .header-action-toolbar :deep(.tts-button:hover) {
  background-color: rgba(255, 255, 255, 0.1) !important;
}

.header-close {
  display: flex;
  align-items: center;
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px;
  transition: background 0.3s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Theme-specific hover effects */
.translation-window.light .action-btn:hover {
  background-color: #f0f0f0;
}

.translation-window.dark .action-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}


.window-body {
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 120px;
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


/* ActionToolbar size adjustments for translation window */
.window-translation-display :deep(.display-toolbar) {
  top: 2px !important;
  left: 2px !important;
  right: 2px !important;
  width: calc(100% - 4px) !important;
  max-width: calc(100% - 4px) !important;
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(4px) !important;
  border-radius: 4px !important;
  padding: 1px 2px !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
  overflow: hidden !important;
}

.window-translation-display :deep(.action-toolbar) {
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
  justify-content: flex-start !important;
}

.window-translation-display :deep(.toolbar-left) {
  gap: 1px !important;
  flex-shrink: 1 !important;
  min-width: 0 !important;
  overflow: hidden !important;
}

.window-translation-display :deep(.action-button) {
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  max-width: 16px !important;
  font-size: 10px !important;
  flex-shrink: 0 !important;
  padding: 1px !important;
  border-radius: 2px !important;
}

.window-translation-display :deep(.action-button .button-icon),
.window-translation-display :deep(.action-button img) {
  width: 12px !important;
  height: 12px !important;
  max-width: 12px !important;
  max-height: 12px !important;
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



/* Normal window specific styles */
.translation-window.normal-window {
  /* Uses default translation-window styles */
}

/* Visibility and animation control */
.translation-window {
  /* Base styles */
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  font-family: 'Vazirmatn', sans-serif;
  
  /* Animation styles */
  opacity: 0;
  transform: scale(0.95);
  transition: opacity 0.2s ease, transform 0.2s ease;
  visibility: hidden;
}

.translation-window.visible {
  opacity: 0.9 !important;
  transform: scale(1) !important;
  visibility: visible !important;
}

/* Enhanced light theme */
.translation-window.light {
  background: #ffffff;
  border: 1px solid #e8e8e8;
  color: #2c3e50;
}

/* Enhanced dark theme */
.translation-window.dark {
  background: #2c3e50;
  border: 1px solid #34495e;
  color: #ecf0f1;
}

</style>