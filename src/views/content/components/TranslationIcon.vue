<template>
  <button
    v-if="isVisible"
    ref="iconElement"
    class="translation-icon"
    :class="{ 'is-hovering': isHovering, 'is-active': isActive }"
    :style="dynamicStyle"
    @click="handleClick"
    @mousedown.prevent.stop
    @mouseup.prevent.stop
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
    :title="$t ? $t('translateSelectedText') : 'Translate selected text'"
    :aria-label="$t ? $t('translateSelectedText') : 'Translate selected text'"
    role="button"
    tabindex="0"
  >
    <svg
      class="translation-icon__svg"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      width="16"
      height="16"
    >
      <g><path fill="#0fa438" d="M 1.5,-0.5 C 10.5,-0.5 19.5,-0.5 28.5,-0.5C 30.4285,3.28543 31.7618,7.28543 32.5,11.5C 33.5946,16.7841 35.2613,21.7841 37.5,26.5C 37.8333,27.8333 38.1667,29.1667 38.5,30.5C 39.6047,34.3517 40.938,38.0184 42.5,41.5C 43.1098,42.391 43.4431,43.391 43.5,44.5C 43.4326,45.9587 43.7659,47.2921 44.5,48.5C 39.5,49.1667 34.5,49.8333 29.5,50.5C 19.4176,50.8074 9.41756,50.4741 -0.5,49.5C -0.5,33.5 -0.5,17.5 -0.5,1.5C 0.5,1.16667 1.16667,0.5 1.5,-0.5 Z"/></g>
      <g><path fill="#e1eae1" d="M 16.5,10.5 C 17.8221,10.33 18.9887,10.6634 20,11.5C 23.3371,19.3461 26.1705,27.3461 28.5,35.5C 27.1779,35.67 26.0113,35.3366 25,34.5C 24.6954,29.6915 22.1954,27.6915 17.5,28.5C 15.8333,28.8333 14.1667,29.1667 12.5,29.5C 11.8333,31.1667 11.1667,32.8333 10.5,34.5C 9.27704,35.6139 7.94371,35.7805 6.5,35C 9.70148,26.7659 13.0348,18.5992 16.5,10.5 Z"/></g>
      <g><path fill="#25a640" d="M 20.5,23.5 C 18.7354,24.4614 16.7354,24.7947 14.5,24.5C 15.562,21.4844 16.7286,18.4844 18,15.5C 19.1356,18.0964 19.969,20.763 20.5,23.5 Z"/></g>
      <g><path fill="#6a8491" d="M 43.5,44.5 C 43.4431,43.391 43.1098,42.391 42.5,41.5C 46.3171,39.3756 46.3171,37.0423 42.5,34.5C 43.2421,33.7132 44.0754,33.0465 45,32.5C 47.8245,36.6749 49.9912,36.3416 51.5,31.5C 47.2172,30.5078 42.8839,30.1744 38.5,30.5C 38.1667,29.1667 37.8333,27.8333 37.5,26.5C 40.5,26.5 43.5,26.5 46.5,26.5C 46.5,25.5 46.5,24.5 46.5,23.5C 47.8333,23.5 49.1667,23.5 50.5,23.5C 50.5,24.5 50.5,25.5 50.5,26.5C 53.5,26.5 56.5,26.5 59.5,26.5C 59.5,27.8333 59.5,29.1667 59.5,30.5C 58.1667,30.5 56.8333,30.5 55.5,30.5C 54.7263,33.3809 53.3929,36.0476 51.5,38.5C 52.5794,40.543 54.246,41.8763 56.5,42.5C 57.7445,43.9554 57.5778,45.2887 56,46.5C 53.5426,45.0222 51.0426,43.6888 48.5,42.5C 46.8228,43.1869 45.1561,43.8535 43.5,44.5 Z"/></g>
      <g><path fill="#93c298" d="M 20.5,23.5 C 21.0431,23.56 21.3764,23.8933 21.5,24.5C 19.0268,25.7969 16.6934,25.7969 14.5,24.5C 16.7354,24.7947 18.7354,24.4614 20.5,23.5 Z"/></g>
      <g><path fill="#e5eae8" d="M 38.5,30.5 C 42.8839,30.1744 47.2172,30.5078 51.5,31.5C 49.9912,36.3416 47.8245,36.6749 45,32.5C 44.0754,33.0465 43.2421,33.7132 42.5,34.5C 46.3171,37.0423 46.3171,39.3756 42.5,41.5C 40.938,38.0184 39.6047,34.3517 38.5,30.5 Z"/></g>
      <g><path fill="#f0f1f1" d="M 32.5,11.5 C 42.9154,11.1917 53.2487,11.525 63.5,12.5C 63.5,28.8333 63.5,45.1667 63.5,61.5C 62.5,61.8333 61.8333,62.5 61.5,63.5C 52.5,63.5 43.5,63.5 34.5,63.5C 34.5,63.1667 34.5,62.8333 34.5,62.5C 38.1803,58.817 41.5136,54.817 44.5,50.5C 45.8333,49.8333 45.8333,49.1667 44.5,48.5C 43.7659,47.2921 43.4326,45.9587 43.5,44.5C 45.1561,43.8535 46.8228,43.1869 48.5,42.5C 51.0426,43.6888 53.5426,45.0222 56,46.5C 57.5778,45.2887 57.7445,43.9554 56.5,42.5C 54.246,41.8763 52.5794,40.543 51.5,38.5C 53.3929,36.0476 54.7263,33.3809 55.5,30.5C 56.8333,30.5 58.1667,30.5 59.5,30.5C 59.5,29.1667 59.5,27.8333 59.5,26.5C 56.5,26.5 53.5,26.5 50.5,26.5C 50.5,25.5 50.5,24.5 50.5,23.5C 49.1667,23.5 47.8333,23.5 46.5,23.5C 46.5,24.5 46.5,25.5 46.5,26.5C 43.5,26.5 40.5,26.5 37.5,26.5C 35.2613,21.7841 33.5946,16.7841 32.5,11.5 Z"/></g>
      <g><path fill="#2d9397" d="M 44.5,48.5 C 45.8333,49.1667 45.8333,49.8333 44.5,50.5C 39.5,50.5 34.5,50.5 29.5,50.5C 34.5,49.8333 39.5,49.1667 44.5,48.5 Z"/></g>
      <g><path fill="#1c66c0" d="M 29.5,50.5 C 34.5,50.5 39.5,50.5 44.5,50.5C 41.5136,54.817 38.1803,58.817 34.5,62.5C 32.8346,58.505 31.1679,54.505 29.5,50.5 Z"/></g>
    </svg>
  </button>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { usePositioning } from '@/composables/usePositioning.js';

const pageEventBus = window.pageEventBus;

const props = defineProps({
  id: { type: String, required: true },
  position: { type: Object, required: true, default: () => ({ top: 0, left: 0 }) },
  text: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['click', 'hover', 'focus', 'close']);

// Reactive state
const isVisible = ref(false);
const isHovering = ref(false);
const isActive = ref(false);
const isFocused = ref(false);

// DOM reference
const iconElement = ref(null);

// Use positioning composable
const { positionStyle, cleanup: cleanupPositioning } = usePositioning(props.position, {
  defaultWidth: 28,
  defaultHeight: 28,
  enableDragging: false
});

const dynamicStyle = computed(() => {
  let bgColor = '#ffffff';
  let brdColor = '#e0e0e0';
  let xform = 'scale(1)';
  let boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)';

  if (isActive.value) {
    bgColor = '#e8f0fe';
    brdColor = '#4285f4';
    xform = 'scale(0.95)';
  } else if (isHovering.value) {
    bgColor = '#f8f9fa';
    brdColor = '#dadce0';
    xform = 'scale(1.1) translateY(-1px)';
    boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.1)';
  }

  return {
    ...positionStyle.value,
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: bgColor,
    border: `1px solid ${brdColor}`,
    boxShadow: boxShadow,
    transform: xform,
    
    // Static styles that might be overridden by user-agent
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    padding: '0',
    margin: '0',
    outline: 'none',
    
    // Z-index and transition
    zIndex: 2147483645,
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  };
});


// Event handlers
const handleClick = (event) => {
  if (props.disabled) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  isActive.value = true;
  setTimeout(() => {
    isActive.value = false;
  }, 150);
  
  const clickData = { id: props.id, text: props.text, position: props.position };
  
  emit('click', clickData);
  
  if (pageEventBus) {
    pageEventBus.emit('windows-manager-icon-clicked', clickData);
  }
};

const onMouseEnter = (event) => {
  if (props.disabled) return;
  isHovering.value = true;
  emit('hover', { id: props.id, type: 'enter', event });
};

const onMouseLeave = (event) => {
  isHovering.value = false;
  emit('hover', { id: props.id, type: 'leave', event });
};

const onFocus = (event) => {
  if (props.disabled) return;
  isFocused.value = true;
  emit('focus', { id: props.id, type: 'focus', event });
};

const onBlur = (event) => {
  isFocused.value = false;
  emit('focus', { id: props.id, type: 'blur', event });
};

const onKeydown = (event) => {
  if (props.disabled) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleClick(event);
  }
};

// Animation
const animateIn = () => {
  isVisible.value = true;
};

const animateOut = () => {
  isVisible.value = false;
  setTimeout(() => {
    emit('close', props.id);
  }, 300);
};

// Initialize component
onMounted(() => {
  animateIn();
  setupEventListeners();
});

onUnmounted(() => {
  cleanupEventListeners();
  cleanupPositioning();
});

// Event listeners
const setupEventListeners = () => {
  const eventName = `dismiss-icon-${props.id}`;
  const wrappedHandler = (data) => {
    handleDismiss();
  };
  
  pageEventBus.on(eventName, wrappedHandler);
  pageEventBus.on('dismiss-all-icons', handleDismissAll);
  
  pageEventBus._wrappedHandler = wrappedHandler;
};

const cleanupEventListeners = () => {
  if (pageEventBus && pageEventBus._wrappedHandler) {
    pageEventBus.off(`dismiss-icon-${props.id}`, pageEventBus._wrappedHandler);
  }
  if (pageEventBus) {
    pageEventBus.off('dismiss-all-icons', handleDismissAll);
  }
};

// Event handlers
const handleDismiss = () => {
  animateOut();
};

const handleDismissAll = () => {
  animateOut();
};

// Public methods
defineExpose({
  updatePosition: (newPosition) => {
    // Position updates are handled via props reactivity in usePositioning
  },
  animateOut
});
</script>

<style scoped>
.translation-icon {
  /* All dynamic styles are now inline. */
  /* This block can be used for non-dynamic overrides if needed. */
  animation: slideInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.translation-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.translation-icon__svg {
  /* Size is now set on the element */
  display: block;
  pointer-events: none;
  transition: transform 0.2s ease;
}

.translation-icon.is-hovering .translation-icon__svg {
  transform: scale(1.05);
}

.translation-icon.is-active .translation-icon__svg {
  transform: scale(0.95);
}

/* Animations */
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .translation-icon {
    border-width: 2px !important; /* Keep important for override */
    border-color: #000 !important;
  }
  
  .translation-icon.is-hovering {
    background-color: #000 !important;
  }
  
  .translation-icon__svg {
    filter: invert(1);
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .translation-icon {
    animation: none;
    transition: none !important; /* Keep important for override */
  }
}

/* Print styles */
@media print {
  .translation-icon {
    display: none;
  }
}
</style>
