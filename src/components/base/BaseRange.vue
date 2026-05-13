<template>
  <div
    :id="id"
    class="ti-range-wrapper"
    :class="{ 'ti-range-wrapper--disabled': disabled }"
  >
    <label
      v-if="label"
      :for="rangeId"
      class="ti-range__label"
    >
      {{ label }}
    </label>
    
    <div class="ti-range__container">
      <input
        :id="rangeId"
        type="range"
        :value="modelValue"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        class="ti-range"
        @input="handleInput"
      >
      <span
        v-if="showValue"
        class="ti-range__value"
      >
        {{ modelValue }}{{ valueSuffix }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import './BaseRange.scss'

defineProps({
  modelValue: {
    type: [Number, String],
    required: true
  },
  id: {
    type: String,
    default: null
  },
  min: {
    type: [Number, String],
    default: 0
  },
  max: {
    type: [Number, String],
    default: 100
  },
  step: {
    type: [Number, String],
    default: 1
  },
  label: {
    type: String,
    default: null
  },
  disabled: {
    type: Boolean,
    default: false
  },
  showValue: {
    type: Boolean,
    default: true
  },
  valueSuffix: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const rangeId = ref(`range-${Math.random().toString(36).substr(2, 9)}`)

const handleInput = (event) => {
  const value = event.target.value
  emit('update:modelValue', Number(value))
  emit('change', Number(value))
}
</script>
