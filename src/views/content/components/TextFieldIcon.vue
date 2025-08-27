<template>
  <button
    class="text-field-icon"
    :style="styleObject"
    @click="onClick"
    @mousedown.prevent.stop
    @mouseup.prevent.stop
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
    title="Translate with Translate-It"
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
import { computed, ref } from 'vue';

const props = defineProps({
  id: { type: String, required: true },
  position: { type: Object, required: true }, // { top, left }
});

const emit = defineEmits(['click']);

// Hover state
const isHovering = ref(false);

const styleObject = computed(() => ({
  top: `${props.position.top}px`,
  left: `${props.position.left}px`,
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
  transform: isHovering.value ? 'scale(1.1)' : 'scale(1)',
  // Reset button styles
  padding: '0',
  margin: '0',
  outline: 'none'
}));

const onClick = (event) => {
  event.stopPropagation(); // Prevent event from bubbling to EventCoordinator
  emit('click', props.id);
};
</script>

<style>
.text-field-icon {
  /* Reset button default styles */
  padding: 0;
  margin: 0;
  background: none;
  border: none;
  outline: none;
  
  /* Apply custom styles */
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
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  z-index: 2147483641; /* Just below the main container */
  transition: all 0.2s ease-in-out;
  opacity: 0;
  transform: scale(0.8);
  animation: fadeIn 0.2s forwards;
}

.text-field-icon:hover {
  background-color: #f5f5f5;
  transform: scale(1.1);
}

.text-field-icon svg {
  color: #5f6368;
}

@keyframes fadeIn {
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
