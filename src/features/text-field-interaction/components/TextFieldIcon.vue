<template>
  <Transition
    name="icon"
    appear
  >
    <button
      v-show="visible"
      class="ti-field-icon"
      :class="computedClasses"
      :style="computedStyle"
      :title="$t ? $t('translateWithTranslateIt') : 'Translate with Translate-It'"
      :aria-label="$t ? $t('translateWithTranslateIt') : 'Translate with Translate-It'"
      role="button"
      tabindex="0"
      @click="onClick"
      @mousedown.prevent.stop
      @mouseup.prevent.stop
      @mouseenter="onMouseEnter"
      @mouseleave="onMouseLeave"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    >
      <svg
        class="ti-field-icon__svg"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <g><path
          fill="#0fa438"
          d="M 1.5,-0.5 C 10.5,-0.5 19.5,-0.5 28.5,-0.5C 30.4285,3.28543 31.7618,7.28543 32.5,11.5C 33.5946,16.7841 35.2613,21.7841 37.5,26.5C 37.8333,27.8333 38.1667,29.1667 38.5,30.5C 39.6047,34.3517 40.938,38.0184 42.5,41.5C 43.1098,42.391 43.4431,43.391 43.5,44.5C 43.4326,45.9587 43.7659,47.2921 44.5,48.5C 39.5,49.1667 34.5,49.8333 29.5,50.5C 19.4176,50.8074 9.41756,50.4741 -0.5,49.5C -0.5,33.5 -0.5,17.5 -0.5,1.5C 0.5,1.16667 1.16667,0.5 1.5,-0.5 Z"
        /></g>
        <g><path
          fill="#e1eae1"
          d="M 16.5,10.5 C 17.8221,10.33 18.9887,10.6634 20,11.5C 23.3371,19.3461 26.1705,27.3461 28.5,35.5C 27.1779,35.67 26.0113,35.3366 25,34.5C 24.6954,29.6915 22.1954,27.6915 17.5,28.5C 15.8333,28.8333 14.1667,29.1667 12.5,29.5C 11.8333,31.1667 11.1667,32.8333 10.5,34.5C 9.27704,35.6139 7.94371,35.7805 6.5,35C 9.70148,26.7659 13.0348,18.5992 16.5,10.5 Z"
        /></g>
        <g><path
          fill="#25a640"
          d="M 20.5,23.5 C 18.7354,24.4614 16.7354,24.7947 14.5,24.5C 15.562,21.4844 16.7286,18.4844 18,15.5C 19.1356,18.0964 19.969,20.763 20.5,23.5 Z"
        /></g>
        <g><path
          fill="#6a8491"
          d="M 43.5,44.5 C 43.4431,43.391 43.1098,42.391 42.5,41.5C 46.3171,39.3756 46.3171,37.0423 42.5,34.5C 43.2421,33.7132 44.0754,33.0465 45,32.5C 47.8245,36.6749 49.9912,36.3416 51.5,31.5C 47.2172,30.5078 42.8839,30.1744 38.5,30.5C 38.1667,29.1667 37.8333,27.8333 37.5,26.5C 40.5,26.5 43.5,26.5 46.5,26.5C 46.5,25.5 46.5,24.5 46.5,23.5C 47.8333,23.5 49.1667,23.5 50.5,23.5C 50.5,24.5 50.5,25.5 50.5,26.5C 53.5,26.5 56.5,26.5 59.5,26.5C 59.5,27.8333 59.5,29.1667 59.5,30.5C 58.1667,30.5 56.8333,30.5 55.5,30.5C 54.7263,33.3809 53.3929,36.0476 51.5,38.5C 52.5794,40.543 54.246,41.8763 56.5,42.5C 57.7445,43.9554 57.5778,45.2887 56,46.5C 53.5426,45.0222 51.0426,43.6888 48.5,42.5C 46.8228,43.1869 45.1561,43.8535 43.5,44.5 Z"
        /></g>
        <g><path
          fill="#93c298"
          d="M 20.5,23.5 C 21.0431,23.56 21.3764,23.8933 21.5,24.5C 19.0268,25.7969 16.6934,25.7969 14.5,24.5C 16.7354,24.7947 18.7354,24.4614 20.5,23.5 Z"
        /></g>
        <g><path
          fill="#e5eae8"
          d="M 38.5,30.5 C 42.8839,30.1744 47.2172,30.5078 51.5,31.5C 49.9912,36.3416 47.8245,36.6749 45,32.5C 44.0754,33.0465 43.2421,33.7132 42.5,34.5C 46.3171,37.0423 46.3171,39.3756 42.5,41.5C 40.938,38.0184 39.6047,34.3517 38.5,30.5 Z"
        /></g>
        <g><path
          fill="#f0f1f1"
          d="M 32.5,11.5 C 42.9154,11.1917 53.2487,11.525 63.5,12.5C 63.5,28.8333 63.5,45.1667 63.5,61.5C 62.5,61.8333 61.8333,62.5 61.5,63.5C 52.5,63.5 43.5,63.5 34.5,63.5C 34.5,63.1667 34.5,62.8333 34.5,62.5C 38.1803,58.817 41.5136,54.817 44.5,50.5C 45.8333,49.8333 45.8333,49.1667 44.5,48.5C 43.7659,47.2921 43.4326,45.9587 43.5,44.5C 45.1561,43.8535 46.8228,43.1869 48.5,42.5C 51.0426,43.6888 53.5426,45.0222 56,46.5C 57.5778,45.2887 57.7445,43.9554 56.5,42.5C 54.246,41.8763 52.5794,40.543 51.5,38.5C 53.3929,36.0476 54.7263,33.3809 55.5,30.5C 56.8333,30.5 58.1667,30.5 59.5,30.5C 59.5,29.1667 59.5,27.8333 59.5,26.5C 56.5,26.5 53.5,26.5 50.5,26.5C 50.5,25.5 50.5,24.5 50.5,23.5C 49.1667,23.5 47.8333,23.5 46.5,23.5C 46.5,24.5 46.5,25.5 46.5,26.5C 43.5,26.5 40.5,26.5 37.5,26.5C 35.2613,21.7841 33.5946,16.7841 32.5,11.5 Z"
        /></g>
        <g><path
          fill="#2d9397"
          d="M 44.5,48.5 C 45.8333,49.1667 45.8333,49.8333 44.5,50.5C 39.5,50.5 34.5,50.5 29.5,50.5C 34.5,49.8333 39.5,49.1667 44.5,48.5 Z"
        /></g>
        <g><path
          fill="#1c66c0"
          d="M 29.5,50.5 C 34.5,50.5 39.5,50.5 44.5,50.5C 41.5136,54.817 38.1803,58.817 34.5,62.5C 32.8346,58.505 31.1679,54.505 29.5,50.5 Z"
        /></g>
      </svg>
    </button>
  </Transition>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';

// Use the new Vue composable for automatic cleanup
const tracker = useResourceTracker('text-field-icon-component')

const props = defineProps({
  id: { type: String, required: true },
  position: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  visible: { type: Boolean, default: true },
  size: { type: String, default: 'medium', validator: (value) => ['small', 'medium', 'large'].includes(value) },
  targetElement: { type: Object, default: null }, // Reference to target element
  attachmentMode: { type: String, default: 'smart' }
});

const emit = defineEmits(['click', 'hover', 'focus', 'position-updated']);

const isHovering = ref(false);
const isActive = ref(false);
const isFocused = ref(false);

const sizeMap = {
  small: { width: 24, height: 24, iconSize: 14 },
  medium: { width: 28, height: 28, iconSize: 16 },
  large: { width: 32, height: 32, iconSize: 18 }
};

// Internal position state for smooth updates
const internalPosition = ref({ ...props.position });
const internalVisible = ref(props.visible);

const currentSize = computed(() => sizeMap[props.size]);

// Watch for position prop changes and animate to new position
watch(() => props.position, (newPosition) => {
  if (newPosition && (newPosition.top !== internalPosition.value.top || newPosition.left !== internalPosition.value.left)) {
    internalPosition.value = { ...newPosition };
    emit('position-updated', { id: props.id, position: newPosition });
  }
}, { deep: true });

// Watch for visibility changes
watch(() => props.visible, (newVisible) => {
  internalVisible.value = newVisible;
});

const computedClasses = computed(() => ({
  'is-hovering': isHovering.value,
  'is-active': isActive.value,
  'is-focused': isFocused.value,
  'is-disabled': props.disabled,
  [`placement-${props.position.placement}`]: props.position.placement,
  [`size-${props.size}`]: true,
  'smart-attached': props.attachmentMode === 'smart'
}));

const computedStyle = computed(() => {
  const baseStyle = {
    position: 'fixed',
    top: `${internalPosition.value.top}px`,
    left: `${internalPosition.value.left}px`,
    width: `${currentSize.value.width}px`,
    height: `${currentSize.value.height}px`,
    zIndex: 2147483647,
  };

  // Add transform based on placement for better positioning
  const placement = props.position.placement;
  if (placement) {
    const transforms = [];
    
    switch (placement) {
      case 'top-right':
        transforms.push('translate(-100%, 0)');
        break;
      case 'bottom-right':
        transforms.push('translate(-100%, -100%)');
        break;
      case 'top-left':
        transforms.push('translate(0, 0)');
        break;
      case 'bottom-left':
        transforms.push('translate(0, -100%)');
        break;
      case 'inside-right':
        transforms.push('translate(-50%, 0)');
        break;
      case 'inside-left':
        transforms.push('translate(-50%, 0)');
        break;
      case 'inside-bottom-right':
        transforms.push('translate(0, 0)');
        break;
      case 'inside-bottom-left':
        transforms.push('translate(0, 0)');
        break;
      case 'inside-top-right':
        transforms.push('translate(0, 0)');
        break;
      case 'inside-top-left':
        transforms.push('translate(0, 0)');
        break;
    }
    
    if (transforms.length > 0) {
      baseStyle.transform = transforms.join(' ');
    }
  }

  return baseStyle;
});

const onClick = (event) => {
  if (props.disabled) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  isActive.value = true;
  // Use ResourceTracker for timeout management
  tracker.trackTimeout(() => {
    isActive.value = false;
  }, 150);
  
  emit('click', props.id, event);
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
    onClick(event);
  }
};

// Public methods for external control
const updatePosition = (newPosition) => {
  internalPosition.value = { ...newPosition };
  emit('position-updated', { id: props.id, position: newPosition });
};

const show = () => {
  internalVisible.value = true;
};

const hide = () => {
  internalVisible.value = false;
};

const forceUpdate = () => {
  // Force reactivity update
  internalPosition.value = { ...internalPosition.value };
};

// Expose methods for parent components
defineExpose({
  updatePosition,
  show,
  hide,
  forceUpdate,
  getPosition: () => internalPosition.value,
  isVisible: () => internalVisible.value
});

onMounted(() => {
  // Initialize internal state
  internalPosition.value = { ...props.position };
  internalVisible.value = props.visible;
});

// Note: cleanup is now automatic via useResourceTracker
</script>

<style scoped>
.ti-field-icon {
  /* Button reset */
  padding: 0;
  margin: 0;
  background: none;
  border: none;
  outline: none;
  font: inherit;

  /* Positioning - handled by computedStyle */
  position: fixed;

  /* Default size - overridden by computedStyle */
  width: 28px;
  height: 28px;

  /* Appearance */
  background-color: #ffffff;
  border: 1px solid #dadce0;
  border-radius: 50%;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 1px 3px rgba(0, 0, 0, 0.08);

  /* Layout */
  display: flex;
  align-items: center;
  justify-content: center;

  /* Interaction */
  cursor: pointer;
  user-select: none;

  /* Z-index - handled by computedStyle */
  z-index: 2147483647;

  /* Animation - smooth position transitions */
  transition:
    all 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    top 0.2s ease-out,
    left 0.2s ease-out;
  opacity: 1;
}

.ti-field-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.ti-field-icon.is-hovering {
  background-color: #f8f9fa;
  border-color: #dadce0;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.15),
    0 2px 6px rgba(0, 0, 0, 0.1);
  transform: scale(1.1) translateY(-1px);
}

.ti-field-icon.is-active {
  background-color: #e8f0fe;
  border-color: #4285f4;
  transform: scale(0.95);
}

.ti-field-icon:focus-visible {
  border-color: #4285f4;
  box-shadow:
    0 0 0 2px rgba(66, 133, 244, 0.2),
    0 2px 8px rgba(0, 0, 0, 0.1);
}

.ti-field-icon__svg {
  width: 16px;
  height: 16px;
  display: block;
  pointer-events: none;
  transition: transform 0.2s ease;
}

.ti-field-icon.is-hovering .ti-field-icon__svg {
  transform: scale(1.05);
}

.ti-field-icon.is-active .ti-field-icon__svg {
  transform: scale(0.95);
}

/* Size variants */
.ti-field-icon.size-small {
  width: 24px;
  height: 24px;
}

.ti-field-icon.size-medium {
  width: 28px;
  height: 28px;
}

.ti-field-icon.size-large {
  width: 32px;
  height: 32px;
}

.ti-field-icon.size-small .ti-field-icon__svg {
  width: 14px;
  height: 14px;
}

.ti-field-icon.size-medium .ti-field-icon__svg {
  width: 16px;
  height: 16px;
}

.ti-field-icon.size-large .ti-field-icon__svg {
  width: 18px;
  height: 18px;
}

/* Placement-specific styles */
.ti-field-icon.placement-inside-right,
.ti-field-icon.placement-inside-left {
  /* Inside placements have slightly different styling */
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(2px);
}

/* Smart attachment indicator */
.ti-field-icon.smart-attached {
  /* Visual indicator for smart positioning */
  box-shadow:
    0 2px 8px rgba(66, 133, 244, 0.1),
    0 1px 3px rgba(66, 133, 244, 0.08),
    inset 0 0 0 1px rgba(66, 133, 244, 0.1);
}

/* Vue transitions */
.icon-enter-active,
.icon-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.icon-enter-from {
  opacity: 0;
  transform: scale(0.8);
}

.icon-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

/* Animation keyframes */
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

/* Responsive adjustments */
@media (max-width: 768px) {
  .ti-field-icon {
    width: 32px;
    height: 32px;
  }

  .ti-field-icon__svg {
    width: 18px;
    height: 18px;
  }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .ti-field-icon {
    border-width: 2px;
    border-color: #000;
  }

  .ti-field-icon.is-hovering {
    background-color: #000;
  }

  .ti-field-icon__svg {
    filter: invert(1);
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .ti-field-icon {
    animation: none;
    transition: none;
  }
}

/* Print styles */
@media print {
  .ti-field-icon {
    display: none;
  }
}
</style>
