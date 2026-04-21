<template>
  <label
    class="base-radio"
    :class="{ disabled }"
  >
    <input
      type="radio"
      :name="name"
      :value="value"
      :checked="modelValue === value"
      :disabled="disabled"
      @change="$emit('update:modelValue', value)"
    >
    <span
      v-if="label"
      class="radio-label"
    >{{ label }}</span>
    <slot v-else />
  </label>
</template>

<script setup>
import './BaseRadio.scss'
defineProps({
  modelValue: {
    type: [String, Number, Boolean],
    default: null
  },
  value: {
    type: [String, Number, Boolean],
    required: true
  },
  name: {
    type: String,
    required: true
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
