<template>
  <div 
    v-if="isVisible"
    ref="windowElement"
    class="translation-window"
    :class="[theme, { 'is-dragging': isDragging, 'visible': isVisible }]"
    :style="windowStyle"
    @mousedown.stop
  >
    <div class="window-header" @mousedown="startDrag">
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
      <div v-else-if="errorMessage" class="error-container">
        <p>{{ errorMessage }}</p>
        <button @click="handleRetry">Retry</button>
      </div>
      <div v-else class="translation-container">
        <div class="original-text" v-if="showOriginal">{{ originalText }}</div>
        <div class="translated-text">{{ translatedText }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { pageEventBus } from '@/utils/core/PageEventBus.js';

const props = defineProps({
  id: { type: String, required: true },
  position: { type: Object, default: () => ({ x: 0, y: 0 }) },
  selectedText: { type: String, default: '' },
  theme: { type: String, default: 'light' }
});

const emit = defineEmits(['close', 'retry', 'speak']);

// State
const isVisible = ref(false);
const isLoading = ref(true);
const translatedText = ref('');
const originalText = ref(props.selectedText);
const errorMessage = ref('');
const isDragging = ref(false);
const isSpeaking = ref(false);
const showOriginal = ref(false);
const currentPosition = ref({
  x: props.position.x || props.position.left || window.innerWidth / 2 - 175, // Default to center
  y: props.position.y || props.position.top || window.innerHeight / 2 - 100
});

// Dragging State
const dragStartOffset = ref({ x: 0, y: 0 });

// Computed Style
const windowStyle = computed(() => ({
  position: 'fixed',
  zIndex: 2147483647,
  left: `${currentPosition.value.x}px`,
  top: `${currentPosition.value.y}px`,
  visibility: isVisible.value ? 'visible' : 'hidden'
}));

// Lifecycle Hooks
onMounted(() => {
  setupEventListeners();
  // Use nextTick to ensure the element is in the DOM for animation
  requestAnimationFrame(() => {
    isVisible.value = true;
  });
});

onUnmounted(() => {
  cleanupEventListeners();
});

// Methods
const handleClose = () => emit('close', props.id);
const handleRetry = () => emit('retry', props.id);
const handleCopy = () => navigator.clipboard.writeText(translatedText.value);

const toggleShowOriginal = () => {
  showOriginal.value = !showOriginal.value;
};

const handleSpeak = () => {
  isSpeaking.value = !isSpeaking.value;
  emit('speak', { id: props.id, text: translatedText.value, isSpeaking: isSpeaking.value });
};

// Drag Handlers
const startDrag = (event) => {
  isDragging.value = true;
  dragStartOffset.value.x = event.clientX - currentPosition.value.x;
  dragStartOffset.value.y = event.clientY - currentPosition.value.y;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (event) => {
  if (!isDragging.value) return;
  currentPosition.value.x = event.clientX - dragStartOffset.value.x;
  currentPosition.value.y = event.clientY - dragStartOffset.value.y;
};

const stopDrag = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

// Event Bus Handlers
const handleTranslationLoading = () => {
  isLoading.value = true;
  errorMessage.value = '';
};

const handleTranslationResult = (detail) => {
  isLoading.value = false;
  translatedText.value = detail.translatedText;
};

const handleTranslationError = (detail) => {
  isLoading.value = false;
  errorMessage.value = detail.message || 'An unknown error occurred.';
};

const setupEventListeners = () => {
  pageEventBus.on(`translation-loading-${props.id}`, handleTranslationLoading);
  pageEventBus.on(`translation-result-${props.id}`, handleTranslationResult);
  pageEventBus.on(`translation-error-${props.id}`, handleTranslationError);
};

const cleanupEventListeners = () => {
  pageEventBus.off(`translation-loading-${props.id}`, handleTranslationLoading);
  pageEventBus.off(`translation-result-${props.id}`, handleTranslationResult);
  pageEventBus.off(`translation-error-${props.id}`, handleTranslationError);
};

</script>

<style scoped>
.translation-window {
  width: 350px;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  font-family: 'Vazirmatn', sans-serif;
  opacity: 0;
  transform: scale(0.95);
  transition: opacity 0.2s ease, transform 0.2s ease;
  visibility: hidden;
}

.translation-window.visible {
    opacity: 1;
    transform: scale(1);
    visibility: visible;
}

.translation-window.light {
  background-color: #ffffff;
  border: 1px solid #e8e8e8;
  color: #2c3e50;
}

.translation-window.light .window-header {
  background-color: #f7f7f7;
  border-bottom: 1px solid #e8e8e8;
}

.translation-window.light .header-title {
  color: #6c757d;
}

.translation-window.light .action-btn {
  background-color: #f0f0f0;
  color: #555;
}

.translation-window.light .action-btn:hover {
  background-color: #e5e5e5;
}

.translation-window.light .original-text {
  color: #6c757d;
  background-color: #fdfdfd;
  border-color: #f0f0f0;
}

.translation-window.light .translated-text {
  color: #2c3e50;
}

.translation-window.light .spinner {
  border-color: rgba(0, 0, 0, 0.1);
  border-top-color: #444;
}

.translation-window.dark {
  background-color: #2d2d2d;
  border: 1px solid #424242;
  color: #e0e0e0;
}

.translation-window.dark .window-header {
  background-color: #333333;
  border-bottom: 1px solid #424242;
}

.translation-window.dark .header-title {
  color: #bdbdbd;
}

.translation-window.dark .action-btn {
  background-color: #424242;
  color: #e0e0e0;
}

.translation-window.dark .action-btn:hover {
  background-color: #555555;
}

.translation-window.dark .original-text {
  color: #bdbdbd;
  background-color: #333333;
  border-color: #424242;
}

.translation-window.dark .translated-text {
  color: #e0e0e0;
}

.translation-window.dark .spinner {
  border-color: rgba(255, 255, 255, 0.2);
  border-top-color: #f5f5f5;
}

.window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: move;
  user-select: none;
  border: red 1px dotted;
  background-color: #f7f7f7;
}

.header-title {
  font-weight: 500;
  font-size: 14px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.window-body {
  padding: 16px;
  min-height: 100px;
  display: flex;
  flex-direction: column;
}

.loading-container, .error-container {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-grow: 1;
  text-align: center;
}

.spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border-width: 3px;
  border-style: solid;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.translation-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.original-text {
  font-size: 14px;
  padding: 8px;
  border-radius: 4px;
  border-right: 3px solid;
}

.translated-text {
  font-size: 16px;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>