/**
 * usePositioning.js - Composable for position management
 * Handles viewport clamping, position updates, and responsive positioning
 */

import { ref, computed } from 'vue';

export function usePositioning(initialPosition, options = {}) {
  const {
    defaultWidth = 350,
    defaultHeight = 180,
    margin = 10,
    enableDragging = false
  } = options;
  

  // Reactive position state
  const currentPosition = ref({ x: 0, y: 0 });
  const dragStartOffset = ref({ x: 0, y: 0 });
  const isDragging = ref(false);

  /**
   * Clamp position to viewport bounds
   */
  function clampToViewport(pos, width = defaultWidth, height = defaultHeight) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    
    let x = pos.x ?? pos.left ?? 0;
    let y = pos.y ?? pos.top ?? 0;


    // Prevent overflow right/bottom
    
    if (x + width > vw) x = vw - width - margin;
    if (x < margin) x = margin;
    if (y + height > vh) y = vh - height - margin;
    if (y < margin) y = margin;
    
    return { x, y };
  }

  /**
   * Update position with viewport clamping
   */
  function updatePosition(newPosition, dimensions) {
    currentPosition.value = clampToViewport(newPosition, dimensions?.width, dimensions?.height);
  }

  /**
   * Initialize position
   */
  function initializePosition(pos) {
    const originalX = pos.x ?? pos.left ?? 0;
    const originalY = pos.y ?? pos.top ?? 0;
    
    let viewportPosition;
    
    // Check if position is already viewport-relative (iframe adjusted positions)
    if (pos._isViewportRelative) {
      // Position is already viewport-relative, don't subtract scroll
      viewportPosition = {
        x: originalX,
        y: originalY
      };
    } else {
      // Convert absolute coordinates to viewport-relative for fixed positioning
      viewportPosition = {
        x: originalX - window.scrollX,
        y: originalY - window.scrollY
      };
    }
    
    currentPosition.value = clampToViewport(viewportPosition);
  }

  // Initialize with provided position
  if (initialPosition) {
    initializePosition(initialPosition);
  }

  // Computed styles for positioning
  const positionStyle = computed(() => ({
    position: 'fixed',
    left: `${currentPosition.value.x}px`,
    top: `${currentPosition.value.y}px`,
    zIndex: 2147483647
  }));

  // Drag handling functions
  const onDrag = (event) => {
    if (!isDragging.value) return;
    
    const newX = event.clientX - dragStartOffset.value.x;
    const newY = event.clientY - dragStartOffset.value.y;
    
    currentPosition.value = clampToViewport({ x: newX, y: newY });
  };

  const stopDrag = () => {
    isDragging.value = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    
    // Restore text selection
    document.body.style.userSelect = '';
  };

  const startDrag = (event) => {
    isDragging.value = true;
    dragStartOffset.value.x = event.clientX - currentPosition.value.x;
    dragStartOffset.value.y = event.clientY - currentPosition.value.y;
    
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    
    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
  };

  // Drag handlers object (if enabled)
  const dragHandlers = enableDragging ? {
    startDrag,
    onDrag,
    stopDrag
  } : {};

  // Responsive positioning on window resize and scroll
  let resizeTimeout;
  const handleResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      currentPosition.value = clampToViewport(currentPosition.value);
    }, 100);
  };

  // Handle scroll events (for components that need to maintain position relative to content)
  let scrollTimeout;
  const handleScroll = () => {
    // Debounced scroll handling - only for cases where position should be maintained
    // Fixed positioned elements don't normally need scroll updates, but adding for completeness
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      // For fixed positioning, we typically don't need to update on scroll
      // But this hook is available for special cases
    }, 50);
  };

  // Setup event listeners
  window.addEventListener('resize', handleResize);
  window.addEventListener('scroll', handleScroll, { passive: true });

  return {
    // State
    currentPosition,
    isDragging,
    
    // Computed
    positionStyle,
    
    // Methods
    updatePosition,
    initializePosition,
    clampToViewport,
    
    // Drag handlers (if enabled)
    ...dragHandlers,
    
    // Cleanup
    cleanup: () => {
      clearTimeout(resizeTimeout);
      clearTimeout(scrollTimeout);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
      if (enableDragging) {
        document.removeEventListener('mousemove', dragHandlers.onDrag);
        document.removeEventListener('mouseup', dragHandlers.stopDrag);
      }
    }
  };
}