import { ref, computed, onMounted, onUnmounted } from "vue";
import { useExtensionAPI } from "@/composables/core/useExtensionAPI.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.SCREEN_CAPTURE, 'useScreenCapture');

export function useScreenCapture() {
  const { startScreenCapture, captureScreenArea } = useExtensionAPI();

  // State
  const isSelecting = ref(false);
  const isCapturing = ref(false);
  const selectionRect = ref({ x: 0, y: 0, width: 0, height: 0 });
  const startPoint = ref({ x: 0, y: 0 });
  const endPoint = ref({ x: 0, y: 0 });
  const capturedImage = ref(null);
  const error = ref(null);

  // Store original style values for restoration
  const originalStyles = ref({
    bodyUserSelect: '',
  });

  // Track event listeners for cleanup
  const activeListeners = ref(new Map());

  // Computed
  const hasSelection = computed(() => {
    return selectionRect.value.width > 10 && selectionRect.value.height > 10;
  });

  const selectionStyle = computed(() => ({
    left: `${selectionRect.value.x}px`,
    top: `${selectionRect.value.y}px`,
    width: `${selectionRect.value.width}px`,
    height: `${selectionRect.value.height}px`,
  }));

  const normalizedRect = computed(() => {
    const { x, y, width, height } = selectionRect.value;
    return {
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: Math.max(0, width),
      height: Math.max(0, height),
      right: Math.max(0, x + width),
      bottom: Math.max(0, y + height),
    };
  });

  // Methods
  const startSelection = (event) => {
    if (isCapturing.value) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    startPoint.value = { x, y };
    endPoint.value = { x, y };
    isSelecting.value = true;

    error.value = null;

    // Save original userSelect value
    originalStyles.value.bodyUserSelect = document.body.style.userSelect || '';

    // Add event listeners for mouse move and up (track them for cleanup)
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    activeListeners.value.set('mousemove', { target: document, event: 'mousemove', handler: handleMouseMove });
    activeListeners.value.set('mouseup', { target: document, event: 'mouseup', handler: handleMouseUp });

    // Prevent text selection during capture
    document.body.style.userSelect = "none";
    event.preventDefault();
  };

  const handleMouseMove = (event) => {
    if (!isSelecting.value) return;

    const x = event.clientX;
    const y = event.clientY;

    endPoint.value = { x, y };
    updateSelectionRect();
  };

  const handleMouseUp = () => {
    if (!isSelecting.value) return;

    // Remove event listeners using tracked references
    const mouseMoveListener = activeListeners.value.get('mousemove');
    const mouseUpListener = activeListeners.value.get('mouseup');

    if (mouseMoveListener) {
      document.removeEventListener(mouseMoveListener.event, mouseMoveListener.handler);
      activeListeners.value.delete('mousemove');
    }
    if (mouseUpListener) {
      document.removeEventListener(mouseUpListener.event, mouseUpListener.handler);
      activeListeners.value.delete('mouseup');
    }

    // Restore text selection (but keep scroll locked until capture finished or cancelled)
    document.body.style.userSelect = originalStyles.value.bodyUserSelect;

    isSelecting.value = false;
  };

  const updateSelectionRect = () => {
    const startX = Math.min(startPoint.value.x, endPoint.value.x);
    const startY = Math.min(startPoint.value.y, endPoint.value.y);
    const endX = Math.max(startPoint.value.x, endPoint.value.x);
    const endY = Math.max(startPoint.value.y, endPoint.value.y);

    selectionRect.value = {
      x: startX,
      y: startY,
      width: endX - startX,
      height: endY - startY,
    };
  };

  const confirmSelection = async (options = {}) => {
    if (!hasSelection.value || isCapturing.value) return;

    try {
      isCapturing.value = true;
      error.value = null;

      // Get viewport coordinates for the selection
      // Multiply by devicePixelRatio for accurate mapping to captureVisibleTab output
      const dpr = window.devicePixelRatio || 1;
      const coordinates = {
        x: Math.round(normalizedRect.value.x * dpr),
        y: Math.round(normalizedRect.value.y * dpr),
        width: Math.round(normalizedRect.value.width * dpr),
        height: Math.round(normalizedRect.value.height * dpr),
      };

      // Capture the screen area
      const response = await captureScreenArea(coordinates, options);

      if (response.success) {
        capturedImage.value = response.data.imageData;

        // Handle empty text as a specific "no-text" error condition
        if (!response.data.text || response.data.text.trim().length === 0) {
          throw new Error("no-text");
        }

        return {
          imageData: response.data.imageData,
          coordinates: coordinates,
          text: response.data.text,
        };
      } else {
        // Map background error strings to internal error keys
        const errorMsg = response.error || "";
        if (errorMsg.includes("OCR engine failed") || errorMsg.includes("model")) {
          throw new Error("model-error");
        }
        throw new Error(errorMsg || "capture-failed");
      }
      } catch (err) {
      logger.error("Capture area error:", err);
      error.value = err.message;
      throw err;

    } finally {
      isCapturing.value = false;
    }
  };

  const resetSelection = () => {
    selectionRect.value = { x: 0, y: 0, width: 0, height: 0 };
    startPoint.value = { x: 0, y: 0 };
    endPoint.value = { x: 0, y: 0 };
    isSelecting.value = false;
    capturedImage.value = null;
    error.value = null;
  };

  const cancelSelection = () => {
    // Remove all tracked event listeners
    activeListeners.value.forEach((listener) => {
      listener.target.removeEventListener(listener.event, listener.handler);
    });
    activeListeners.value.clear();

    // Restore text selection and unlock scroll
    document.body.style.userSelect = originalStyles.value.bodyUserSelect;

    resetSelection();
  };

  // Keyboard handling
  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      cancelSelection();
    } else if (event.key === "Enter" && hasSelection.value) {
      confirmSelection();
    }
  };

  // Touch support for mobile devices
  const handleTouchStart = (event) => {
    if (isCapturing.value || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const rect = event.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    startPoint.value = { x, y };
    endPoint.value = { x, y };
    isSelecting.value = true;

    error.value = null;

    // Add touch event listeners (track them for cleanup)
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    activeListeners.value.set('touchmove', { target: document, event: 'touchmove', handler: handleTouchMove });
    activeListeners.value.set('touchend', { target: document, event: 'touchend', handler: handleTouchEnd });

    event.preventDefault();
  };

  const handleTouchMove = (event) => {
    if (!isSelecting.value || event.touches.length !== 1) return;

    const touch = event.touches[0];
    endPoint.value = { x: touch.clientX, y: touch.clientY };
    updateSelectionRect();

    event.preventDefault();
  };

  const handleTouchEnd = () => {
    if (!isSelecting.value) return;

    // Remove touch event listeners using tracked references
    const touchMoveListener = activeListeners.value.get('touchmove');
    const touchEndListener = activeListeners.value.get('touchend');

    if (touchMoveListener) {
      document.removeEventListener(touchMoveListener.event, touchMoveListener.handler);
      activeListeners.value.delete('touchmove');
    }
    if (touchEndListener) {
      document.removeEventListener(touchEndListener.event, touchEndListener.handler);
      activeListeners.value.delete('touchend');
    }

    isSelecting.value = false;
  };

  // Full screen capture (no selection needed)
  const captureFullScreen = async (options = {}) => {
    try {
      isCapturing.value = true;
      error.value = null;

      // Pass null explicitly for full screen to avoid undefined issues in messaging
      const response = await captureScreenArea(null, options);

      if (response.success) {
        capturedImage.value = response.data.imageData;
        
        // Handle empty text as a specific "no-text" error condition
        if (!response.data.text || response.data.text.trim().length === 0) {
          throw new Error("no-text");
        }
        
        return {
          imageData: response.data.imageData,
          coordinates: null, // Full screen
          text: response.data.text,
        };
      } else {
        // Map background error strings to internal error keys
        const errorMsg = response.error || "";
        if (errorMsg.includes("OCR engine failed") || errorMsg.includes("model")) {
          throw new Error("model-error");
        }
        throw new Error(errorMsg || "capture-failed");
      }
    } catch (err) {
      logger.error("Full screen capture error:", err);
      error.value = err.message;
      throw err;
    } finally {
      isCapturing.value = false;
    }
  };

  // Initialize screen capture mode
  const initializeCapture = async () => {
    try {
      await startScreenCapture();
      return true;
    } catch (err) {
      logger.error("Failed to initialize screen capture:", err);
      error.value = err.message || "Failed to initialize screen capture";
      return false;
    }
  };

  // Utility function to convert coordinates to different formats
  const getRelativeCoordinates = (containerRect) => {
    if (!hasSelection.value) return null;

    return {
      x: (normalizedRect.value.x / containerRect.width) * 100,
      y: (normalizedRect.value.y / containerRect.height) * 100,
      width: (normalizedRect.value.width / containerRect.width) * 100,
      height: (normalizedRect.value.height / containerRect.height) * 100,
    };
  };

  // Get absolute coordinates for the current viewport
  const getAbsoluteCoordinates = () => {
    if (!hasSelection.value) return null;

    return {
      x: normalizedRect.value.x + window.scrollX,
      y: normalizedRect.value.y + window.scrollY,
      width: normalizedRect.value.width,
      height: normalizedRect.value.height,
    };
  };

  // Lifecycle management
  onMounted(() => {
    document.addEventListener("keydown", handleKeyDown);
    activeListeners.value.set('keydown', { target: document, event: 'keydown', handler: handleKeyDown });
  });

  onUnmounted(() => {
    cancelSelection();

    // Clean up keydown listener
    const keydownListener = activeListeners.value.get('keydown');
    if (keydownListener) {
      document.removeEventListener(keydownListener.event, keydownListener.handler);
      activeListeners.value.delete('keydown');
    }

    // Ensure all remaining listeners are cleaned up
    activeListeners.value.forEach((listener) => {
      listener.target.removeEventListener(listener.event, listener.handler);
    });
    activeListeners.value.clear();

    // Ensure all styles are restored
    document.body.style.userSelect = originalStyles.value.bodyUserSelect;
  });

  return {
    // State
    isSelecting,
    isCapturing,
    selectionRect,
    capturedImage,
    error,

    // Computed
    hasSelection,
    selectionStyle,
    normalizedRect,

    // Methods
    startSelection,
    confirmSelection,
    cancelSelection,
    resetSelection,
    captureFullScreen,
    initializeCapture,

    // Touch support
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,

    // Utilities
    getRelativeCoordinates,
    getAbsoluteCoordinates,
  };
}
