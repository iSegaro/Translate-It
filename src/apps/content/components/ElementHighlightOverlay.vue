<template>
  <div
    v-if="!isFullscreen && activeHighlights.length > 0"
    class="element-highlight-overlay"
  >
    <div 
      v-for="highlight in activeHighlights" 
      :key="highlight.id"
      class="highlight-element"
      :style="highlight.style"
      @click="onElementClick(highlight.element, highlight.id)"
    >
      <div
        v-if="showTooltip"
        class="highlight-tooltip"
      >
        {{ tooltipText }}
      </div>
    </div>
  </div>
</template>

<script setup>
import './ElementHighlightOverlay.scss'
import { ref, computed, onMounted } from 'vue';
import { pageEventBus } from '@/core/PageEventBus.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { useMobileStore } from '@/store/modules/mobile.js';

const activeHighlights = ref([]);
const showTooltip = ref(false);
const mobileStore = useMobileStore();
const tracker = useResourceTracker('element-highlight-overlay');

// i18n
const { t } = useUnifiedI18n();

const isFullscreen = computed(() => mobileStore.isFullscreen);
const tooltipText = computed(() => t('click_to_translate'));
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'ElementHighlightOverlay');

// Generate unique IDs for highlights
let highlightCounter = 0;
const generateId = () => `highlight-${Date.now()}-${highlightCounter++}`;

onMounted(() => {
  // Listen for highlight events via tracker for automatic cleanup
  tracker.addEventListener(pageEventBus, 'element-highlight', (detail) => {
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

  tracker.addEventListener(pageEventBus, 'element-unhighlight', (detail) => {
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

  tracker.addEventListener(pageEventBus, 'clear-all-highlights', () => {
    // Remove highlight class from all elements
    activeHighlights.value.forEach(highlight => {
      highlight.element.classList.remove('translate-it-element-highlighted');
    });
    activeHighlights.value = [];
  });
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