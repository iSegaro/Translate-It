import { ref, computed, onMounted, onUnmounted } from "vue";
import { useExtensionAPI } from "@/composables/core/useExtensionAPI.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useScreenCapture');

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

    // Add event listeners for mouse move and up
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

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

    // Remove event listeners
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);

    // Restore text selection
    document.body.style.userSelect = "";

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

  const confirmSelection = async () => {
    if (!hasSelection.value || isCapturing.value) return;

    try {
      isCapturing.value = true;
      error.value = null;

      // Get viewport coordinates for the selection
      const coordinates = {
        x: normalizedRect.value.x,
        y: normalizedRect.value.y,
        width: normalizedRect.value.width,
        height: normalizedRect.value.height,
      };

      // Capture the screen area
      const response = await captureScreenArea(coordinates);

      if (response.success) {
        capturedImage.value = response.data.imageData;
        return {
          imageData: response.data.imageData,
          coordinates: coordinates,
        };
      } else {
        throw new Error(response.error || "Failed to capture screen area");
      }
    } catch (err) {
      logger.error("Screen capture error:", err);
      error.value = err.message || "Failed to capture screen area";
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
    // Remove event listeners if active
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);

    // Restore text selection
    document.body.style.userSelect = "";

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

    // Add touch event listeners
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);

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

    // Remove touch event listeners
    document.removeEventListener("touchmove", handleTouchMove);
    document.removeEventListener("touchend", handleTouchEnd);

    isSelecting.value = false;
  };

  // Full screen capture (no selection needed)
  const captureFullScreen = async () => {
    try {
      isCapturing.value = true;
      error.value = null;

      const response = await captureScreenArea();

      if (response.success) {
        capturedImage.value = response.data.imageData;
        return {
          imageData: response.data.imageData,
          coordinates: null, // Full screen
        };
      } else {
        throw new Error(response.error || "Failed to capture full screen");
      }
    } catch (err) {
      logger.error("Full screen capture error:", err);
      error.value = err.message || "Failed to capture full screen";
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
  });

  onUnmounted(() => {
    cancelSelection();
    document.removeEventListener("keydown", handleKeyDown);
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