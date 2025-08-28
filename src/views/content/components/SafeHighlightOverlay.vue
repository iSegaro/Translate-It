<template>
  <div 
    class="safe-highlight-overlay" 
    :class="{ active: isSelectModeActive }"
  >
    <!-- Element highlights -->
    <div 
      v-for="highlight in activeHighlights" 
      :key="highlight.id"
      class="safe-highlight-element"
      :style="highlight.style"
      @click.stop="onElementClick(highlight.element, highlight.id)"
    >
      <div class="highlight-tooltip" v-if="showTooltip">
        {{ tooltipText }}
      </div>
    </div>
    
    <!-- Main interaction capture overlay for mouse events -->
    <div 
      v-if="isSelectModeActive"
      class="interaction-capture-overlay"
      @mousemove.passive="handleMouseMove"
      @click.prevent.stop="handleDocumentClick"
      @contextmenu.prevent.stop
    ></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { pageEventBus } from '@/utils/core/PageEventBus.js';

const activeHighlights = ref([]);
const isSelectModeActive = ref(false);
const showCursorOverlay = ref(false);
const captureInteractions = ref(false);
const showTooltip = ref(false);
const tooltipText = ref('Click to translate');
const lastMousePosition = ref({ x: 0, y: 0 });
const lastHighlightedElement = ref(null);

// Generate unique IDs for highlights
let highlightCounter = 0;
const generateId = () => `safe-highlight-${Date.now()}-${highlightCounter++}`;

// Debouncing variables
let mouseOverDebounceTimer = null;
let mouseOutDebounceTimer = null;
const MOUSE_DEBOUNCE_DELAY = 50; // 50ms debounce

const cursorOverlayStyle = computed(() => ({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  cursor: 'crosshair',
  pointerEvents: showCursorOverlay.value ? 'auto' : 'none',
  zIndex: 2147483645
}));

// Listen for safe highlighting events
pageEventBus.on('element-highlight', (detail) => {
  const { element, rect } = detail;
  
  // Debug: Log the received rect
  console.log('[SafeHighlight] Received highlight request:', { element, rect });
  
  // Use the rect coordinates directly as they should already include scroll offset
  const highlight = {
    id: detail.id || generateId(),
    element,
    style: {
      position: 'absolute',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      pointerEvents: 'auto',
      zIndex: 2147483646
    }
  };
  
  // Add or update highlight
  const existingIndex = activeHighlights.value.findIndex(h => h.id === highlight.id);
  if (existingIndex !== -1) {
    activeHighlights.value[existingIndex] = highlight;
  } else {
    activeHighlights.value.push(highlight);
  }
  
  console.log('[SafeHighlight] Element highlighted with style:', highlight.style);
});

pageEventBus.on('element-unhighlight', (detail) => {
  if (detail.id) {
    activeHighlights.value = activeHighlights.value.filter(h => h.id !== detail.id);
  } else if (detail.element) {
    activeHighlights.value = activeHighlights.value.filter(h => h.element !== detail.element);
  } else {
    activeHighlights.value = [];
  }
});

pageEventBus.on('clear-all-highlights', () => {
  activeHighlights.value = [];
});

// Listen for select mode activation/deactivation events
pageEventBus.on('select-mode-activated', () => {
  isSelectModeActive.value = true;
  console.log('[SafeHighlight] Select mode activated');
});

pageEventBus.on('select-mode-deactivated', () => {
  isSelectModeActive.value = false;
  console.log('[SafeHighlight] Select mode deactivated');
  
  // Clear all highlights when mode is deactivated
  activeHighlights.value = [];
  
  // Clear any pending timers
  if (mouseOverDebounceTimer) {
    clearTimeout(mouseOverDebounceTimer);
    mouseOverDebounceTimer = null;
  }
  if (mouseOutDebounceTimer) {
    clearTimeout(mouseOutDebounceTimer);
    mouseOutDebounceTimer = null;
  }
  
  // Reset state
  lastHighlightedElement.value = null;
  lastMousePosition.value = { x: 0, y: 0 };
});

// Listen for select mode style events
pageEventBus.on('select-mode-styles-enable', (detail) => {
  showCursorOverlay.value = detail.cursor === 'crosshair';
  console.log('[SafeHighlight] Select mode styles enabled');
});

pageEventBus.on('select-mode-styles-disable', () => {
  showCursorOverlay.value = false;
  console.log('[SafeHighlight] Select mode styles disabled');
});

// Listen for interaction control events
pageEventBus.on('disable-page-interactions', (detail) => {
  captureInteractions.value = true;
  console.log('[SafeHighlight] Page interactions disabled');
});

pageEventBus.on('enable-page-interactions', () => {
  captureInteractions.value = false;
  console.log('[SafeHighlight] Page interactions enabled');
});

const onElementClick = (element, highlightId) => {
  // Emit event for SelectElementManager to handle
  pageEventBus.emit('element-selected', {
    element,
    highlightId
  });
  
  // Clear this highlight
  activeHighlights.value = activeHighlights.value.filter(h => h.id !== highlightId);
};

const handleMouseOver = (event) => {
  if (!isSelectModeActive.value) return;
  
  // Update mouse position
  lastMousePosition.value = { x: event.clientX, y: event.clientY };
  
  // Clear any pending mouse out timer
  if (mouseOutDebounceTimer) {
    clearTimeout(mouseOutDebounceTimer);
    mouseOutDebounceTimer = null;
  }
  
  // Debounce mouse over events
  if (mouseOverDebounceTimer) {
    clearTimeout(mouseOverDebounceTimer);
  }
  
  mouseOverDebounceTimer = setTimeout(() => {
    const elementBelow = getElementBelowPoint(event.clientX, event.clientY);
    
    // Only emit if element has changed
    if (elementBelow && elementBelow !== lastHighlightedElement.value) {
      lastHighlightedElement.value = elementBelow;
      
      pageEventBus.emit('safe-element-mouseover', {
        element: elementBelow,
        coordinates: { x: event.clientX, y: event.clientY }
      });
    }
    mouseOverDebounceTimer = null;
  }, MOUSE_DEBOUNCE_DELAY);
};

const handleMouseOut = (event) => {
  if (!isSelectModeActive.value) return;
  
  // Clear any pending mouse over timer
  if (mouseOverDebounceTimer) {
    clearTimeout(mouseOverDebounceTimer);
    mouseOverDebounceTimer = null;
  }
  
  // Debounce mouse out events
  if (mouseOutDebounceTimer) {
    clearTimeout(mouseOutDebounceTimer);
  }
  
  mouseOutDebounceTimer = setTimeout(() => {
    const elementBelow = getElementBelowPoint(event.clientX, event.clientY);
    
    if (lastHighlightedElement.value) {
      pageEventBus.emit('safe-element-mouseout', {
        element: lastHighlightedElement.value,
        coordinates: { x: event.clientX, y: event.clientY }
      });
      lastHighlightedElement.value = null;
    }
    mouseOutDebounceTimer = null;
  }, MOUSE_DEBOUNCE_DELAY);
};

const handleClick = (event) => {
  if (!isSelectModeActive.value) return;
  
  const elementBelow = getElementBelowPoint(event.clientX, event.clientY);
  if (elementBelow) {
    event.preventDefault();
    event.stopPropagation();
    
    pageEventBus.emit('safe-element-click', {
      element: elementBelow,
      coordinates: { x: event.clientX, y: event.clientY }
    });
  }
};

const handleMouseMove = (event) => {
  if (!isSelectModeActive.value) return;
  
  // Update mouse position
  const newPosition = { x: event.clientX, y: event.clientY };
  const lastPos = lastMousePosition.value;
  
  // Only process if mouse has moved significantly (reduces noise from micro-movements)
  const threshold = 5; // pixels
  if (Math.abs(newPosition.x - lastPos.x) < threshold && 
      Math.abs(newPosition.y - lastPos.y) < threshold) {
    return;
  }
  
  lastMousePosition.value = newPosition;
  
  // Clear any pending timers
  if (mouseOverDebounceTimer) {
    clearTimeout(mouseOverDebounceTimer);
  }
  if (mouseOutDebounceTimer) {
    clearTimeout(mouseOutDebounceTimer);
  }
  
  // Debounced element detection
  mouseOverDebounceTimer = setTimeout(() => {
    const elementBelow = getElementBelowPoint(newPosition.x, newPosition.y);
    
    if (elementBelow) {
      // Let ElementHighlighter determine the best element to highlight
      // by emitting the raw element, not comparing here
      
      // Always clear previous highlight first
      if (lastHighlightedElement.value) {
        pageEventBus.emit('safe-element-mouseout', {
          element: lastHighlightedElement.value,
          coordinates: newPosition
        });
      }
      
      // Store the raw element below cursor
      lastHighlightedElement.value = elementBelow;
      
      // Emit mouseover for ElementHighlighter to process
      pageEventBus.emit('safe-element-mouseover', {
        element: elementBelow,
        coordinates: newPosition
      });
    }
    mouseOverDebounceTimer = null;
  }, MOUSE_DEBOUNCE_DELAY);
};

const handleDocumentClick = (event) => {
  if (!isSelectModeActive.value) return;
  
  const elementBelow = getElementBelowPoint(event.clientX, event.clientY);
  if (elementBelow) {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('[SafeHighlight] Document click on element:', elementBelow);
    
    pageEventBus.emit('safe-element-click', {
      element: elementBelow,
      coordinates: { x: event.clientX, y: event.clientY }
    });
  }
};

const getElementBelowPoint = (clientX, clientY) => {
  // Temporarily disable all our overlays
  const shadowHost = document.getElementById('translate-it-host');
  const originalPointerEvents = shadowHost?.style.pointerEvents;
  
  if (shadowHost) {
    shadowHost.style.pointerEvents = 'none';
  }
  
  let elementBelow = null;
  
  try {
    elementBelow = document.elementFromPoint(clientX, clientY);
    
    // Validate element is not our own
    if (elementBelow && !isOurElement(elementBelow)) {
      // Additional validation for dynamic content
      if (elementBelow.nodeType === Node.ELEMENT_NODE && 
          elementBelow.tagName && 
          !elementBelow.hasAttribute('data-translate-ignore')) {
        return elementBelow;
      }
    }
  } catch (error) {
    console.warn('[SafeHighlight] Error getting element at point:', error);
  } finally {
    // Restore pointer events
    if (shadowHost) {
      shadowHost.style.pointerEvents = originalPointerEvents || '';
    }
  }
  
  return null;
};

const isOurElement = (element) => {
  if (!element) return false;
  
  // Check if it's our shadow host
  if (element.id === 'translate-it-host') return true;
  
  // Check if it's inside our shadow host
  const shadowHost = document.getElementById('translate-it-host');
  if (shadowHost && shadowHost.contains(element)) return true;
  
  // Check for our specific classes or attributes
  if (element.classList && (
    element.classList.contains('safe-highlight-overlay') ||
    element.classList.contains('element-highlight-overlay') ||
    element.classList.contains('translation-window') ||
    element.classList.contains('translation-icon') ||
    element.classList.contains('text-field-icon') ||
    element.hasAttribute('data-translate-ui')
  )) {
    return true;
  }
  
  return false;
};
</script>

<style scoped>
.safe-highlight-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2147483645;
}

.safe-highlight-overlay.active {
  pointer-events: auto;
  cursor: crosshair;
}

.cursor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair !important;
  pointer-events: none;
  z-index: 2147483645;
}

.safe-highlight-element {
  position: absolute;
  border: 3px solid #ff8800 !important;
  border-radius: 4px;
  background-color: rgba(255, 136, 0, 0.15) !important;
  pointer-events: auto;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 2147483646 !important;
  box-shadow: 0 0 10px rgba(255, 136, 0, 0.3) !important;
}

.safe-highlight-element:hover {
  border: 4px solid #ff5500 !important;
  background-color: rgba(255, 136, 0, 0.25) !important;
  box-shadow: 0 0 15px rgba(255, 136, 0, 0.5) !important;
}

.highlight-tooltip {
  position: absolute;
  top: -35px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #333;
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.highlight-tooltip::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid #333;
}

.interaction-capture-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  z-index: 2147483644;
  cursor: crosshair;
  background: transparent;
  /* Prevent text selection during highlighting */
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}
</style>