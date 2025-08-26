<template>
  <div 
    ref="windowElement"
  class="translation-window aiwc-selection-popup-host"
    :class="[theme, { 'is-dragging': isDragging, 'visible': isVisible }]"
    :style="windowStyle"
    @mousedown.stop
    @click.stop
  >
    <div class="window-header" @mousedown="handleStartDrag">
      <div class="header-title">Translate It</div>
      <div class="header-actions">
        <button class="action-btn" @click.stop="toggleShowOriginal" title="Show/Hide Original Text">
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8s8 3.58 8 8s-3.58 8-8 8zm-2-9.41V12h2.59L15 14.41V16h-4v-1.59L8.59 12H7v-2h3.59L13 7.59V6h4v1.59L14.41 10H12v.59z"/></svg>
        </button>
        <button class="action-btn" @click.stop="handleCopy" title="Copy">
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
        </button>
        <button class="action-btn" @click.stop="handleSpeak" :title="isSpeaking ? 'Stop' : 'Speak'">
          <svg v-if="!isSpeaking" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button class="action-btn" @click.stop="handleClose" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
    </div>

    <div class="window-body">
      <div v-if="isLoading" class="loading-container">
        <div class="spinner"></div>
      </div>
      <div v-else class="translation-container">
        <div class="original-text" v-if="showOriginal">{{ originalText }}</div>
        <div class="translated-text">{{ translatedText }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { usePositioning } from '@/composables/usePositioning.js';

const props = defineProps({
  id: { type: String, required: true },
  position: { type: Object, default: () => ({ x: 0, y: 0 }) },
  selectedText: { type: String, default: '' },
  initialTranslatedText: { type: String, default: '' },
  theme: { type: String, default: 'light' },
  isLoading: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'speak']);

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
const translatedText = computed(() => props.initialTranslatedText);
const originalText = ref(props.selectedText);
const errorMessage = ref('');
const isDragging = ref(false);
const isSpeaking = ref(false);
const showOriginal = ref(false);

// Use positioning composable with drag enabled
const {
  currentPosition,
  isDragging: isPositionDragging,
  positionStyle,
  startDrag,
  cleanup: cleanupPositioning
} = usePositioning(props.position, {
  defaultWidth: 350,
  defaultHeight: 180,
  enableDragging: true
});

// Watch for position prop changes
watch(() => props.position, (newPos) => {
  currentPosition.value = { x: newPos.x || newPos.left || 0, y: newPos.y || newPos.top || 0 };
});

// Computed Style for animation and positioning
const windowStyle = computed(() => ({
  ...positionStyle.value,
  opacity: isVisible.value ? 1 : 0,
  transform: isVisible.value ? 'scale(1)' : 'scale(0.95)',
  transition: 'opacity 0.2s ease, transform 0.2s ease'
}));


// When the component is mounted, start invisible and then animate in.
onMounted(() => {
  // Use requestAnimationFrame to ensure the transition is applied after the initial render
  requestAnimationFrame(() => {
    isVisible.value = true;
  });
});

onUnmounted(() => {
  // Cleanup positioning composable
  cleanupPositioning();
});

// Methods
const handleClose = () => emit('close', props.id);
const handleCopy = () => navigator.clipboard.writeText(props.initialTranslatedText);

const toggleShowOriginal = () => {
  showOriginal.value = !showOriginal.value;
};

const handleSpeak = () => {
  isSpeaking.value = !isSpeaking.value;
  emit('speak', { id: props.id, text: props.initialTranslatedText, isSpeaking: isSpeaking.value });
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
}

.translation-window.light {
  background: #fff;
  color: #000;
}

.translation-window.dark {
  background: #333;
  color: #fff;
}

.window-header {
  padding: 10px;
  cursor: move;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  font-weight: bold;
  font-size: 16px;
}

.header-actions {
  display: flex;
  gap: 5px;
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

.window-body {
  padding: 10px;
  max-height: 400px;
  overflow-y: auto;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.original-text, .translated-text {
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
}

.translated-text {
  font-weight: bold;
}

.error-message {
  color: red;
  font-weight: bold;
}
</style>