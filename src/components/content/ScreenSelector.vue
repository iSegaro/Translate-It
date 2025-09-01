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
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ScreenSelector')

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
  logger.debug('✅ Confirm Selection clicked!')
  if (!hasSelection.value || isCapturing.value) {
    logger.debug('⚠️ Cannot confirm: no selection or already capturing')
    return
  }

  try {
    const result = await captureSelection()
    logger.debug('✅ Selection captured successfully')
    emit('select', result)
    props.onSelect(result)
  } catch (err) {
    logger.error('❌ Selection capture failed:', err)
    emit('error', err)
    props.onError(err)
  }
}

const captureFullScreen = async () => {
  logger.debug('🖥️ Capture Full Screen clicked!')
  if (isCapturing.value) {
    logger.debug('⚠️ Already capturing, ignoring click')
    return
  }

  try {
    const result = await captureFullScreenArea()
    logger.debug('✅ Full screen captured successfully')
    emit('select', result)
    props.onSelect(result)
  } catch (err) {
    logger.error('❌ Full screen capture failed:', err)
    emit('error', err)
    props.onError(err)
  }
}

const resetSelection = () => {
  logger.debug('🔄 Reset Selection clicked!')
  resetCaptureSelection()
}

const cancel = () => {
  logger.debug('❌ Cancel clicked!')
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
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseleave', handleMouseLeave)
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('contextmenu', handleContextMenu)
  
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

<style scoped>
.screen-selector-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  cursor: crosshair;
  z-index: 2147483647;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  
  &.selecting {
    cursor: crosshair;
  }
  
  &.capturing {
    cursor: wait;
  }
}

/* Selection box */
.selection-box {
  position: absolute;
  border: 2px solid #2196f3;
  background: rgba(33, 150, 243, 0.1);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5);
  pointer-events: none;
}

.selection-corners {
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
}

.corner {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #2196f3;
  border: 1px solid white;
  border-radius: 50%;
}

.corner-tl { top: -4px; left: -4px; }
.corner-tr { top: -4px; right: -4px; }
.corner-bl { bottom: -4px; left: -4px; }
.corner-br { bottom: -4px; right: -4px; }

.selection-info {
  position: absolute;
  top: -30px;
  left: 0;
  background: rgba(33, 150, 243, 0.9);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

/* Instructions panel */
.instruction-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
  
  &.visible {
    opacity: 1;
    pointer-events: auto;
  }
}

.instruction-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.instruction-icon {
  font-size: 48px;
  opacity: 0.8;
}

.instruction-text h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.instruction-text p {
  margin: 0 0 16px 0;
  color: #666;
  font-size: 14px;
}

.instruction-shortcuts {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #888;
}

.instruction-shortcuts kbd {
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 2px 6px;
  font-family: monospace;
  font-size: 11px;
}

/* Toolbar */
.capture-toolbar {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
  
  &.visible {
    opacity: 1;
    pointer-events: auto;
  }
}

.toolbar-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.capture-options,
.action-buttons {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: #f8f9fa;
    border-color: #bbb;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.capture-btn:hover:not(:disabled) {
  background: #e3f2fd;
  border-color: #2196f3;
  color: #2196f3;
}

.fullscreen-btn:hover:not(:disabled) {
  background: #f3e5f5;
  border-color: #9c27b0;
  color: #9c27b0;
}

.reset-btn:hover:not(:disabled) {
  background: #fff3e0;
  border-color: #ff9800;
  color: #ff9800;
}

.cancel-btn:hover:not(:disabled) {
  background: #ffebee;
  border-color: #f44336;
  color: #f44336;
}

.btn-icon {
  font-size: 14px;
}

.btn-text {
  font-weight: 500;
}

.capture-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
  padding-left: 16px;
  border-left: 1px solid #eee;
  color: #666;
  font-size: 13px;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #f3f3f3;
  border-radius: 50%;
  border-top: 2px solid #2196f3;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Error panel */
.error-panel {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(244, 67, 54, 0.95);
  color: white;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  animation: slideInUp 0.3s ease;
}

.error-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.error-icon {
  font-size: 16px;
}

.error-close {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 16px;
  margin-left: 8px;
  opacity: 0.8;
  
  &:hover {
    opacity: 1;
  }
}

@keyframes slideInUp {
  from {
    transform: translateX(-50%) translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

/* Crosshair */
.crosshair {
  position: absolute;
  width: 20px;
  height: 20px;
  pointer-events: none;
  z-index: 2147483648;
}

.crosshair::before,
.crosshair::after {
  content: '';
  position: absolute;
  background: rgba(33, 150, 243, 0.8);
}

.crosshair::before {
  left: 50%;
  top: 0;
  width: 1px;
  height: 100%;
  transform: translateX(-50%);
}

.crosshair::after {
  top: 50%;
  left: 0;
  height: 1px;
  width: 100%;
  transform: translateY(-50%);
}

/* Responsive design */
@media (max-width: 768px) {
  .instruction-panel {
    max-width: calc(100vw - 40px);
    padding: 20px;
  }
  
  .instruction-icon {
    font-size: 36px;
  }
  
  .capture-toolbar {
    max-width: calc(100vw - 40px);
    padding: 8px;
  }
  
  .toolbar-content {
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .toolbar-btn {
    padding: 6px 8px;
    font-size: 12px;
  }
  
  .btn-text {
    display: none;
  }
  
  .instruction-shortcuts {
    flex-direction: column;
    gap: 4px;
  }
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .instruction-panel {
    background: rgba(45, 45, 45, 0.95);
  }
  
  .instruction-text h3 {
    color: #e0e0e0;
  }
  
  .instruction-text p {
    color: #aaa;
  }
  
  .instruction-shortcuts {
    color: #888;
  }
  
  .instruction-shortcuts kbd {
    background: #404040;
    border-color: #555;
    color: #ccc;
  }
  
  .capture-toolbar {
    background: rgba(45, 45, 45, 0.95);
  }
  
  .toolbar-btn {
    background: #404040;
    border-color: #555;
    color: #e0e0e0;
  }
  
  .toolbar-btn:hover:not(:disabled) {
    background: #4a4a4a;
    border-color: #666;
  }
}
</style>