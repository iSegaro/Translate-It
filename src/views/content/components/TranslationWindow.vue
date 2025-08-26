<template>
  <div 
    v-if="isVisible"
    ref="windowElement"
    class="translation-window"
    :class="{
      'enhanced-mode': useEnhancedRenderer,
      'classic-mode': !useEnhancedRenderer,
      'is-dragging': isDragging
    }"
    :style="windowStyle"
    @mousedown="onMouseDown"
  >
    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner"></div>
      <span class="loading-text">در حال ترجمه...</span>
    </div>

    <!-- Translation Content -->
    <div v-else-if="translatedText" class="translation-content">
      <!-- Enhanced Renderer Mode -->
      <template v-if="useEnhancedRenderer">
        <div class="enhanced-header">
          <div class="text-actions">
            <button class="action-btn" @click="handleCopy" title="کپی">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
            </button>
            <button class="action-btn" @click="handleSpeak" :title="isSpeaking ? 'توقف' : 'خواندن'">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path v-if="!isSpeaking" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                <path v-else d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>
            <button class="action-btn" @click="handleClose" title="بستن">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="enhanced-body">
          <div class="original-text" v-if="showOriginal">
            {{ originalText }}
          </div>
          <div class="translated-text">
            {{ translatedText }}
          </div>
        </div>
      </template>

      <!-- Classic Renderer Mode -->
      <template v-else>
        <div class="classic-header">
          <div class="drag-handle" @mousedown="startDrag">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 9H4v2h16V9zM4 15h16v-2H4v2z"/>
            </svg>
          </div>
          <button class="close-btn" @click="handleClose">×</button>
        </div>
        
        <div class="classic-content">
          <div class="translation-result">
            {{ translatedText }}
          </div>
        </div>
      </template>
    </div>

    <!-- Error State -->
    <div v-else-if="errorMessage" class="error-container">
      <div class="error-icon">⚠️</div>
      <div class="error-message">{{ errorMessage }}</div>
      <button class="retry-btn" @click="handleRetry">تلاش مجدد</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { pageEventBus, WINDOWS_MANAGER_EVENTS } from '@/utils/core/PageEventBus.js';

const props = defineProps({
  id: {
    type: String,
    required: true
  },
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  },
  selectedText: {
    type: String,
    default: ''
  },
  mode: {
    type: String,
    default: 'window' // 'window' or 'icon'
  }
});

const emit = defineEmits(['close', 'retry', 'copy', 'speak']);

// Reactive state
const isVisible = ref(false);
const isLoading = ref(false);
const translatedText = ref('');
const originalText = ref('');
const errorMessage = ref('');
const isDragging = ref(false);
const isSpeaking = ref(false);
const showOriginal = ref(false);
const useEnhancedRenderer = ref(false);

// DOM references
const windowElement = ref(null);

// Drag state
const dragStartX = ref(0);
const dragStartY = ref(0);
const currentPosition = ref({ 
  x: props.position.x || props.position.left,
  y: props.position.y || props.position.top
});

// Computed styles
const windowStyle = computed(() => ({
  position: 'fixed',
  zIndex: isDragging.value ? 2147483647 : 2147483646,
  left: `${currentPosition.value.x || props.position.left || 0}px`,
  top: `${currentPosition.value.y || props.position.top || 0}px`,
  transform: isDragging.value ? 'scale(1.02)' : 'scale(1)'
}));

// Initialize component
onMounted(() => {
  originalText.value = props.selectedText;
  checkRendererPreference();
  animateIn();
  setupEventListeners();
});

onUnmounted(() => {
  cleanupEventListeners();
});

// Check if enhanced renderer should be used
const checkRendererPreference = () => {
  const savedPreference = localStorage.getItem('windows-manager-enhanced-version');
  useEnhancedRenderer.value = savedPreference === 'true';
};

// Animation
const animateIn = () => {
  isVisible.value = true;
  // CSS animations will handle the visual entrance
};

const animateOut = () => {
  isVisible.value = false;
  // CSS animations will handle the visual exit
  setTimeout(() => {
    emit('close', props.id);
  }, 300); // Match CSS animation duration
};

// Event handlers
const handleClose = () => {
  animateOut();
};

const handleRetry = () => {
  emit('retry', props.id);
};

const handleCopy = () => {
  if (translatedText.value) {
    navigator.clipboard.writeText(translatedText.value);
    emit('copy', props.id);
  }
};

const handleSpeak = () => {
  isSpeaking.value = !isSpeaking.value;
  emit('speak', { id: props.id, text: translatedText.value, isSpeaking: isSpeaking.value });
};

// Drag handling
const startDrag = (event) => {
  isDragging.value = true;
  dragStartX.value = event.clientX - currentPosition.value.x;
  dragStartY.value = event.clientY - currentPosition.value.y;
  
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
  event.preventDefault();
};

const onDrag = (event) => {
  if (!isDragging.value) return;
  
  currentPosition.value = {
    x: event.clientX - dragStartX.value,
    y: event.clientY - dragStartY.value
  };
};

const stopDrag = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

const onMouseDown = (event) => {
  // Prevent clicks from propagating to underlying page
  event.stopPropagation();
};

// Event listeners
const setupEventListeners = () => {
  pageEventBus.on(`translation-result-${props.id}`, handleTranslationResult);
  pageEventBus.on(`translation-error-${props.id}`, handleTranslationError);
  pageEventBus.on(`translation-loading-${props.id}`, handleTranslationLoading);
  pageEventBus.on('dismiss-all-windows', handleDismissAll);
  pageEventBus.on(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, handleIconClicked);
};

const cleanupEventListeners = () => {
  pageEventBus.off(`translation-result-${props.id}`, handleTranslationResult);
  pageEventBus.off(`translation-error-${props.id}`, handleTranslationError);
  pageEventBus.off(`translation-loading-${props.id}`, handleTranslationLoading);
  pageEventBus.off('dismiss-all-windows', handleDismissAll);
  pageEventBus.off(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, handleIconClicked);
};

// Event handlers
const handleTranslationLoading = () => {
  isLoading.value = true;
  errorMessage.value = '';
  translatedText.value = '';
};

const handleTranslationResult = (detail) => {
  isLoading.value = false;
  translatedText.value = detail.translatedText;
  errorMessage.value = '';
};

const handleTranslationError = (detail) => {
  isLoading.value = false;
  errorMessage.value = detail.message;
  translatedText.value = '';
};

const handleDismissAll = () => {
  animateOut();
};

const handleIconClicked = (detail) => {
  // Handle icon click events if needed
  // This can be used to coordinate between windows and icons
  if (detail.id && detail.id !== props.id) {
    // Another icon was clicked, maybe dismiss this window?
    // animateOut();
  }
};

// Public methods (can be called from parent)
const showLoading = () => {
  isLoading.value = true;
  errorMessage.value = '';
  translatedText.value = '';
};

const updatePosition = (newPosition) => {
  currentPosition.value = { ...newPosition };
};

// Expose methods if needed
defineExpose({
  showLoading,
  updatePosition,
  handleTranslationResult,
  handleTranslationError
});
</script>

<style scoped>
.translation-window {
  z-index: 2147483646; /* Just below the main container */
  min-width: 300px;
  max-width: 500px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid #e0e0e0;
  overflow: hidden;
  transition: all 0.3s ease;
  animation: slideIn 0.3s ease-out;
}

.translation-window.is-dragging {
  cursor: grabbing;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  z-index: 2147483647; /* Highest when dragging */
}

/* Enhanced Mode */
.enhanced-mode {
  padding: 16px;
}

.enhanced-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.text-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: #f5f5f5;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: #e0e0e0;
  color: #333;
}

.enhanced-body {
  font-family: 'Vazirmatn', sans-serif;
}

.original-text {
  color: #666;
  font-size: 14px;
  margin-bottom: 8px;
  padding: 8px;
  background: #f9f9f9;
  border-radius: 6px;
  border-right: 3px solid #e0e0e0;
}

.translated-text {
  color: #333;
  font-size: 16px;
  line-height: 1.6;
}

/* Classic Mode */
.classic-mode {
  padding: 0;
}

.classic-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  cursor: move;
}

.drag-handle {
  cursor: grab;
  color: #6c757d;
  padding: 4px;
}

.drag-handle:active {
  cursor: grabbing;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: #6c757d;
  cursor: pointer;
  padding: 0 4px;
}

.close-btn:hover {
  color: #dc3545;
}

.classic-content {
  padding: 16px;
  font-family: 'Vazirmatn', sans-serif;
}

.translation-result {
  color: #333;
  font-size: 15px;
  line-height: 1.5;
}

/* Loading State */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #666;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

.loading-text {
  font-size: 14px;
  font-family: 'Vazirmatn', sans-serif;
}

/* Error State */
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #dc3545;
  text-align: center;
}

.error-icon {
  font-size: 24px;
  margin-bottom: 12px;
}

.error-message {
  font-size: 14px;
  margin-bottom: 16px;
  font-family: 'Vazirmatn', sans-serif;
}

.retry-btn {
  padding: 8px 16px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: 'Vazirmatn', sans-serif;
  font-size: 14px;
}

.retry-btn:hover {
  background: #c82333;
}

/* Animations */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 480px) {
  .translation-window {
    min-width: 280px;
    max-width: 90vw;
    left: 50% !important;
    transform: translateX(-50%);
  }
  
  .translation-window.is-dragging {
    transform: translateX(-50%) scale(1.02);
  }
}
</style>
