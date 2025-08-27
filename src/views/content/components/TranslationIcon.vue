<template>
  <button
    v-if="isVisible"
    ref="iconElement"
    class="translation-icon"
    :style="iconStyle"
    @click="handleClick"
    @mousedown.prevent.stop
    @mouseup.prevent.stop
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
    title="Translate selected text"
  >
    <img
      src="@/assets/icons/extension_icon_64.svg"
      alt="Translate Icon"
      width="16"
      height="16"
      style="display: block; pointer-events: none;"
    />
  </button>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
// Use window.pageEventBus to ensure same instance as useWindowsManager
const pageEventBus = window.pageEventBus;
import { usePositioning } from '@/composables/usePositioning.js';

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

// Use positioning composable
const { positionStyle, cleanup: cleanupPositioning } = usePositioning(props.position, {
  defaultWidth: 28,
  defaultHeight: 28,
  enableDragging: false
});

// Computed styles with hover effect - include all essential styles to ensure they're not overridden
const iconStyle = computed(() => ({
  ...positionStyle.value,
  transform: isHovering.value ? 'scale(1.1)' : 'scale(1)',
  // Ensure circular shape is always applied
  borderRadius: '50%',
  width: '28px',
  height: '28px',
  backgroundColor: isHovering.value ? '#f5f5f5' : '#ffffff',
  border: '1px solid #e0e0e0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
  cursor: 'pointer',
  // Reset button styles
  padding: '0',
  margin: '0',
  outline: 'none'
}));

// Initialize component
onMounted(() => {
  animateIn();
  setupEventListeners();
});

onUnmounted(() => {
  cleanupEventListeners();
  cleanupPositioning();
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
  console.log(`[TranslationIcon ${props.id}] handleClick called, about to emit`);
  event.stopPropagation();
  
  const clickData = { id: props.id, text: props.text, position: props.position };
  console.log(`[TranslationIcon ${props.id}] emitting click with:`, clickData);
  
  // Emit both Vue event AND direct pageEventBus event to ensure it reaches WindowsManager
  // even if Vue component gets dismissed during processing
  emit('click', clickData);
  
  // Also emit directly to pageEventBus as backup
  if (pageEventBus) {
    console.log(`[TranslationIcon ${props.id}] also emitting directly to pageEventBus`);
    pageEventBus.emit('windows-manager-icon-clicked', clickData);
  }
};

// Event listeners
const setupEventListeners = () => {
  const eventName = `dismiss-icon-${props.id}`;
  const wrappedHandler = (data) => {
    handleDismiss();
  };
  
  pageEventBus.on(eventName, wrappedHandler);
  pageEventBus.on('dismiss-all-icons', handleDismissAll);
  
  // Store for cleanup
  pageEventBus._wrappedHandler = wrappedHandler;
};

const cleanupEventListeners = () => {
  if (pageEventBus._wrappedHandler) {
    pageEventBus.off(`dismiss-icon-${props.id}`, pageEventBus._wrappedHandler);
  }
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

<style>
  .translation-icon {
    /* Reset button default styles */
    padding: 0;
    margin: 0;
    background: none;
    border: none;
    outline: none;
    
    /* Apply custom styles */
    position: fixed;
    width: 28px;
    height: 28px;
    background-color: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    z-index: 2147483645;
    transition: all 0.2s ease-in-out;
    opacity: 0;
    transform: scale(0.8);
    animation: fadeIn 0.2s forwards;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }

.translation-icon:hover {
  background-color: #f5f5f5;
  transform: scale(1.1);
}

.translation-icon svg {
  color: #5f6368;
}

.icon-hovering {
  transform: scale(1.1);
}



/* Animations */
@keyframes fadeIn {
  to {
    opacity: 1;
    transform: scale(1);
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
