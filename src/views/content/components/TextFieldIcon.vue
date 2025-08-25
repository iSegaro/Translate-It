<template>
  <button
    class="text-field-icon"
    :style="styleObject"
    @click="onClick"
    @mousedown.prevent.stop
    @mouseup.prevent.stop
    title="Translate with Translate-It"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35c-.98 1.08-2.27 2.3-3.66 3.58l-1.41-1.42L1 16l3.89 3.89l1.42-1.42L4.16 16.34c1.4-1.25 2.7-2.48 3.66-3.58c1.13-1.27 2.11-2.62 2.91-4.01H4.22V6.97h12.62c-.29 1.45-.83 2.84-1.59 4.1l-2.15-2.15l-.03.03l-2.54 2.51zM21.33 16.12l-7.19-7.19l-1.41 1.41l7.19 7.19z"/></svg>
  </button>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  id: { type: String, required: true },
  position: { type: Object, required: true }, // { top, left }
});

const emit = defineEmits(['click']);

const styleObject = computed(() => ({
  top: `${props.position.top}px`,
  left: `${props.position.left}px`,
}));

const onClick = (event) => {
  event.stopPropagation(); // Prevent event from bubbling to EventCoordinator
  emit('click', props.id);
};
</script>

<style>
.text-field-icon {
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
