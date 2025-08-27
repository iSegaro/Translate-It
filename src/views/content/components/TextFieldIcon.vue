<template>
  <button
    class="text-field-icon"
    :style="styleObject"
    @click="onClick"
    @mousedown.prevent.stop
    @mouseup.prevent.stop
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
