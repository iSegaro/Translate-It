<template>
  <div 
    class="screen-selector-overlay" 
    :class="{ selecting: isSelecting, capturing: isCapturing }"
    @mousedown="startSelection"
    @touchstart="handleTouchStart"
  >
    <!-- Selection box -->
    <div 
      v-if="hasSelection"
      class="selection-box"
      :style="selectionStyle"
    >
      <!-- Selection corners for resize handles -->
      <div class="selection-corners">
        <div class="corner corner-tl" />
        <div class="corner corner-tr" />
        <div class="corner corner-bl" />
        <div class="corner corner-br" />
      </div>
      
      <!-- Selection info -->
      <div class="selection-info">
        {{ Math.round(selectionRect.width) }} × {{ Math.round(selectionRect.height) }}
      </div>
    </div>
    
    <!-- Instructions -->
    <div
      class="instruction-panel"
      :class="{ visible: !hasSelection && !isCapturing }"
    >
      <div class="instruction-content">
        <div class="instruction-icon">
          📸
        </div>
        <div class="instruction-text">
          <h3>Select Area to Translate</h3>
          <p>Click and drag to select text or image area</p>
          <div class="instruction-shortcuts">
            <span><kbd>Esc</kbd> Cancel</span>
            <span><kbd>Enter</kbd> Capture</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Toolbar -->
    <div
      class="capture-toolbar"
      :class="{ visible: hasSelection || isCapturing }"
    >
      <div class="toolbar-content">
        <!-- Capture options -->
        <div class="capture-options">
          <button 
            class="toolbar-btn capture-btn"
            :disabled="!hasSelection || isCapturing" 
            title="Capture selected area"
            @click="confirmSelection"
          >
            <span class="btn-icon">📸</span>
            <span class="btn-text">Capture</span>
          </button>
          
          <button 
            class="toolbar-btn fullscreen-btn"
            :disabled="isCapturing"
            title="Capture entire screen"
            @click="captureFullScreen"
          >
            <span class="btn-icon">🖼️</span>
            <span class="btn-text">Full Screen</span>
          </button>
        </div>
        
        <!-- Action buttons -->
        <div class="action-buttons">
          <button 
            class="toolbar-btn reset-btn"
            :disabled="isCapturing"
            title="Reset selection"
            @click="resetSelection"
          >
            <span class="btn-icon">🔄</span>
            <span class="btn-text">Reset</span>
          </button>
          
          <button 
            class="toolbar-btn cancel-btn"
            :disabled="isCapturing"
            title="Cancel capture"
            @click="cancel"
          >
            <span class="btn-icon">✕</span>
            <span class="btn-text">Cancel</span>
          </button>
        </div>
      </div>
      
      <!-- Loading indicator -->
      <div
        v-if="isCapturing"
        class="capture-loading"
      >
        <div class="loading-spinner" />
        <span>Capturing...</span>
      </div>
    </div>
    
    <!-- Error message -->
    <div
      v-if="error"
      class="error-panel"
    >
      <div class="error-content">
        <span class="error-icon">⚠️</span>
        <span class="error-text">{{ error }}</span>
        <button
          class="error-close"
          @click="clearError"
        >
          ✕
        </button>
      </div>
    </div>
    
    <!-- Crosshair cursor -->
    <div 
      v-if="showCrosshair" 
      class="crosshair"
      :style="{ left: cursorX + 'px', top: cursorY + 'px' }"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useScreenCapture } from '@/features/screen-capture/composables/useScreenCapture.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ScreenSelector')

// Resource tracker for memory management
const tracker = useResourceTracker('screen-selector')

const props = defineProps({
  onSelect: {
    type: Function,
    default: () => {}
  },
  onCancel: {
    type: Function,
    default: () => {}
  },
  onError: {
    type: Function,
    default: () => {}
  },
  showInstructions: {
    type: Boolean,
    default: true
  },
  allowFullScreen: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['select', 'cancel', 'error'])

// Use screen capture composable
const {
  isSelecting,
  isCapturing,
  selectionRect,
  error,
  hasSelection,
  selectionStyle,
  startSelection,
  confirmSelection: captureSelection,
  cancelSelection,
  resetSelection: resetCaptureSelection,
  captureFullScreen: captureFullScreenArea,
  handleTouchStart
} = useScreenCapture()

// Additional state
const showCrosshair = ref(false)
const cursorX = ref(0)
const cursorY = ref(0)

// Methods
const confirmSelection = async () => {
  logger.debug('Confirm Selection clicked!')
  if (!hasSelection.value || isCapturing.value) {
    logger.debug('Cannot confirm: no selection or already capturing')
    return
  }

  try {
    const result = await captureSelection()
    logger.debug('Selection captured successfully')
    emit('select', result)
    props.onSelect(result)
  } catch (err) {
    logger.error('Selection capture failed:', err)
    emit('error', err)
    props.onError(err)
  }
}

const captureFullScreen = async () => {
  logger.debug('Capture Full Screen clicked!')
  if (isCapturing.value) {
    logger.debug('Already capturing, ignoring click')
    return
  }

  try {
    const result = await captureFullScreenArea()
    logger.debug('Full screen captured successfully')
    emit('select', result)
    props.onSelect(result)
  } catch (err) {
    logger.error('Full screen capture failed:', err)
    emit('error', err)
    props.onError(err)
  }
}

const resetSelection = () => {
  logger.debug('Reset Selection clicked!')
  resetCaptureSelection()
}

const cancel = () => {
  logger.debug('Cancel clicked!')
  cancelSelection()
  emit('cancel')
  props.onCancel()
}

const clearError = () => {
  error.value = null
}

// Mouse tracking for crosshair
const handleMouseMove = (event) => {
  cursorX.value = event.clientX
  cursorY.value = event.clientY
  
  if (!isSelecting.value) {
    showCrosshair.value = true
  }
}

const handleMouseLeave = () => {
  showCrosshair.value = false
}

// Keyboard shortcuts
const handleKeyDown = (event) => {
  switch (event.key) {
    case 'Escape':
      cancel()
      break
    case 'Enter':
      if (hasSelection.value) {
        confirmSelection()
      }
      break
    case 'r':
    case 'R':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        resetSelection()
      }
      break
    case 'f':
    case 'F':
      if (event.ctrlKey || event.metaKey && props.allowFullScreen) {
        event.preventDefault()
        captureFullScreen()
      }
      break
  }
}

// Prevent context menu
const handleContextMenu = (event) => {
  event.preventDefault()
}

// Lifecycle
onMounted(async () => {
  // Inject Screen Capture specific styles lazily
  try {
    const { screenCaptureUiStyles } = await import('@/core/content-scripts/chunks/lazy-styles.js');
    const { injectStylesToShadowRoot } = await import('@/utils/ui/styleInjector.js');
    
    if (screenCaptureUiStyles && injectStylesToShadowRoot) {
      injectStylesToShadowRoot(screenCaptureUiStyles, 'vue-screen-capture-specific-styles');
    }
  } catch (error) {
    console.warn('[ScreenSelector] Failed to load lazy styles:', error);
  }

  tracker.addEventListener(document, 'mousemove', handleMouseMove)
  tracker.addEventListener(document, 'mouseleave', handleMouseLeave)
  tracker.addEventListener(document, 'keydown', handleKeyDown)
  tracker.addEventListener(document, 'contextmenu', handleContextMenu)
  
  // Focus the overlay to receive keyboard events
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseleave', handleMouseLeave)
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('contextmenu', handleContextMenu)
  
  // Restore body overflow
  document.body.style.overflow = ''
})
</script>
