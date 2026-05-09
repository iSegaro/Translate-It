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

    <!-- Toolbar -->
    <div class="capture-toolbar visible">
      <div class="toolbar-content">
        <!-- Capture options -->
        <div class="capture-options">
          <button 
            class="toolbar-btn capture-btn"
            :disabled="!hasSelection || isCapturing" 
            :title="$t('screen_capture_label')"
            @click="confirmSelection"
          >
            <img :src="CaptureIcon" class="btn-icon" alt="Capture" />
            <span class="btn-text">{{ $t('screen_capture_label') }}</span>
          </button>
          
          <button 
            v-if="allowFullScreen"
            class="toolbar-btn fullscreen-btn"
            :disabled="isCapturing"
            :title="$t('screen_capture_full_screen')"
            @click="captureFullScreen"
          >
            <img :src="FullscreenIcon" class="btn-icon" alt="Full Screen" />
            <span class="btn-text">{{ $t('screen_capture_full_screen') }}</span>
          </button>
        </div>
        
        <!-- Action buttons -->
        <div class="action-buttons">
          <button 
            class="toolbar-btn cancel-btn"
            :disabled="isCapturing"
            :title="$t('screen_capture_cancel')"
            @click="cancel"
          >
            <img :src="CloseIcon" class="btn-icon" alt="Cancel" />
            <span class="btn-text">{{ $t('screen_capture_cancel') }}</span>
          </button>
        </div>
      </div>
      
      <!-- Loading indicator -->
      <div
        v-if="isCapturing"
        class="capture-loading"
      >
        <div class="loading-spinner" />
        <span>{{ $t('screen_capture_capturing') }}</span>
      </div>

      <!-- Minimal Toolbar Hint -->
      <div v-if="!isCapturing" class="toolbar-hint">
        <span v-if="!hasSelection" class="hint-text">{{ $t('screen_capture_drag_to_select') }}</span>
        <span v-if="!hasSelection" class="hint-separator">•</span>
        <span class="hint-shortcut"><kbd>ESC</kbd> {{ $t('screen_capture_cancel') }}</span>
      </div>
    </div>

    <!-- Error message -->
    <div
      v-if="error"
      class="error-panel"
    >
      <div class="error-content">
        <img :src="WarningIcon" class="error-icon" alt="Warning" />
        <span class="error-text">{{ $t('screen_capture_error') }}: {{ error }}</span>
        <button
          class="error-close"
          @click="clearError"
        >
          <img :src="CloseIcon" class="close-icon-img" alt="Close" />
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
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useScreenCapture } from '@/features/screen-capture/composables/useScreenCapture.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

// Icons
import CaptureIcon from '@/icons/ui/capture.svg'
import FullscreenIcon from '@/icons/ui/whole-page.png'
import CloseIcon from '@/icons/ui/close.svg'
import WarningIcon from '@/icons/ui/warning.svg'

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

// Watch for selection completion to auto-capture or cancel on click
watch(isSelecting, (newValue, oldValue) => {
  // When mouse is released (isSelecting goes from true to false)
  if (oldValue === true && newValue === false) {
    if (hasSelection.value) {
      logger.info('Auto-capturing after selection completion');
      confirmSelection();
    } else {
      logger.info('No selection made (simple click), cancelling capture');
      cancel();
    }
  }
});

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
