<template>
  <label
    class="ti-checkbox"
    :class="{ 'ti-checkbox--disabled': disabled }"
  >
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.checked)"
    >
    <span
      v-if="label"
      class="ti-checkbox__label"
    >{{ label }}</span>
    <slot v-else />
  </label>
</template>

<script setup>
import './BaseCheckbox.scss'
defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  label: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:modelValue'])
</script>
