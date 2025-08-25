<template>
  <div
    v-if="isVisible"
    ref="iconElement"
    class="translation-icon"
    :style="iconStyle"
    @click="handleClick"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
  >
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="currentColor"
      :class="{ 'icon-hovering': isHovering }"
    >
      <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
    </svg>
    
    <!-- Tooltip on hover -->
    <div v-if="isHovering" class="icon-tooltip">
      ترجمه متن انتخاب شده
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { pageEventBus } from '@/utils/core/PageEventBus.js';

const props = defineProps({
  id: {
    type: String,
    required: true
  },
  position: {
    type: Object,
    required: true,
    default: () => ({ top: 0, left: 0 })
  },
  text: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['click']);

// Reactive state
const isVisible = ref(false);
const isHovering = ref(false);

// DOM reference
const iconElement = ref(null);

// Computed styles
const iconStyle = computed(() => ({
  top: `${props.position.top}px`,
  left: `${props.position.left}px`,
  transform: isHovering.value ? 'scale(1.2)' : 'scale(1)'
}));

// Initialize component
onMounted(() => {
  animateIn();
  setupEventListeners();
});

onUnmounted(() => {
  cleanupEventListeners();
});

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
  }, 200); // Match CSS animation duration
};

// Event handlers
const handleClick = (event) => {
  event.stopPropagation();
  emit('click', { id: props.id, text: props.text, position: props.position });
};

// Event listeners
const setupEventListeners = () => {
  pageEventBus.on(`dismiss-icon-${props.id}`, handleDismiss);
  pageEventBus.on('dismiss-all-icons', handleDismissAll);
};

const cleanupEventListeners = () => {
  pageEventBus.off(`dismiss-icon-${props.id}`, handleDismiss);
  pageEventBus.off('dismiss-all-icons', handleDismissAll);
};

// Event handlers
const handleDismiss = () => {
  animateOut();
};

const handleDismissAll = () => {
  animateOut();
};

// Public methods (can be called from parent)
const updatePosition = (newPosition) => {
  // Position updates are handled through props reactivity
};

// Expose methods if needed
defineExpose({
  updatePosition,
  animateOut
});
</script>

<style scoped>
.translation-icon {
  position: absolute;
  width: 28px;
  height: 28px;
  background-color: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 2147483645;
  transition: all 0.2s ease-in-out;
  animation: iconAppear 0.3s ease-out;
}

.translation-icon:hover {
  background-color: #f8f9fa;
  border-color: #007bff;
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.25);
}

.translation-icon svg {
  color: #5f6368;
  transition: color 0.2s ease;
}

.translation-icon:hover svg {
  color: #007bff;
}

.icon-hovering {
  transform: scale(1.1);
}

/* Tooltip */
.icon-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: #333;
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Vazirmatn', sans-serif;
  white-space: nowrap;
  margin-bottom: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 2147483647;
}

.icon-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: #333;
}

/* Animations */
@keyframes iconAppear {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(-5px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes iconDisappear {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.8);
  }
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .translation-icon {
    width: 32px;
    height: 32px;
  }
  
  .translation-icon svg {
    width: 18px;
    height: 18px;
  }
  
  .icon-tooltip {
    font-size: 11px;
    padding: 4px 8px;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .translation-icon {
    border: 2px solid #000;
    background-color: #fff;
  }
  
  .translation-icon:hover {
    border-color: #0066cc;
    background-color: #f0f8ff;
  }
  
  .translation-icon svg {
    color: #000;
  }
  
  .translation-icon:hover svg {
    color: #0066cc;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .translation-icon {
    transition: none;
    animation: none;
  }
  
  .translation-icon:hover {
    transform: none;
  }
  
  .icon-tooltip {
    transition: none;
  }
}
</style>
