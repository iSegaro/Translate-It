<template>
  <div class="element-highlight-overlay">
    <div 
      v-for="highlight in activeHighlights" 
      :key="highlight.id"
      class="highlight-element"
      :style="highlight.style"
      @click="onElementClick(highlight.element, highlight.id)"
    >
      <div class="highlight-tooltip" v-if="showTooltip">
        {{ tooltipText }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { pageEventBus } from '@/core/PageEventBus.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const activeHighlights = ref([]);
const showTooltip = ref(false);
const tooltipText = ref('Click to translate');
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ElementHighlightOverlay');

// Generate unique IDs for highlights
let highlightCounter = 0;
const generateId = () => `highlight-${Date.now()}-${highlightCounter++}`;

  // Listen for highlight events
  pageEventBus.on('element-highlight', (detail) => {
    const { element, rect } = detail;
    
    // Create highlight style based on element position
    const highlight = {
      id: detail.id || generateId(),
      element,
      style: {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }
    };
    
    // Add or update highlight
    const existingIndex = activeHighlights.value.findIndex(h => h.id === highlight.id);
    if (existingIndex !== -1) {
      activeHighlights.value[existingIndex] = highlight;
    } else {
      activeHighlights.value.push(highlight);
    }
    
    logger.debug('Highlight element added:', highlight);
    
    // Also add the original highlight class to the element itself
    element.classList.add('translate-it-element-highlighted');
  });

pageEventBus.on('element-unhighlight', (detail) => {
  if (detail.id) {
    const highlight = activeHighlights.value.find(h => h.id === detail.id);
    if (highlight) {
      highlight.element.classList.remove('translate-it-element-highlighted');
    }
    activeHighlights.value = activeHighlights.value.filter(h => h.id !== detail.id);
  } else if (detail.element) {
    detail.element.classList.remove('translate-it-element-highlighted');
    activeHighlights.value = activeHighlights.value.filter(h => h.element !== detail.element);
  } else {
    // Remove from all elements
    activeHighlights.value.forEach(highlight => {
      highlight.element.classList.remove('translate-it-element-highlighted');
    });
    activeHighlights.value = [];
  }
});

pageEventBus.on('clear-all-highlights', () => {
  // Remove highlight class from all elements
  activeHighlights.value.forEach(highlight => {
    highlight.element.classList.remove('translate-it-element-highlighted');
  });
  activeHighlights.value = [];
});

const onElementClick = (element, highlightId) => {
  // Remove highlight class before emitting event
  element.classList.remove('translate-it-element-highlighted');
  
  // Emit event for SelectElementManager to handle
  pageEventBus.emit('element-selected', {
    element,
    highlightId
  });
  
  // Clear this highlight
  activeHighlights.value = activeHighlights.value.filter(h => h.id !== highlightId);
};
</script>

<style scoped>
.element-highlight-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2147483646; /* Just below the main container */
}

.highlight-element {
  position: absolute;
  outline: 3px solid #ff8800 !important;
  outline-offset: 2px !important;
  pointer-events: auto;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 2147483646 !important;
}

.highlight-element:hover {
  outline: 4px solid #ff5500 !important;
  outline-offset: 1px !important;
}

.highlight-tooltip {
  position: absolute;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #333;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}

.highlight-tooltip::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 4px solid #333;
}
</style>
