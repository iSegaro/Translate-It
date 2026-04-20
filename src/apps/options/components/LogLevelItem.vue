<template>
  <div 
    class="log-level-item"
    :class="[`level-${modelValue}`]"
  >
    <span class="component-name">{{ componentName }}</span>
    <BaseSelect
      :model-value="modelValue"
      :options="logLevelOptions"
      class="log-level-select"
      @update:model-value="$emit('update:modelValue', Number($event))"
    />
  </div>
</template>

<script setup>
import './LogLevelItem.scss'
import BaseSelect from '@/components/base/BaseSelect.vue'

defineProps({
  componentName: {
    type: String,
    required: true
  },
  modelValue: {
    type: Number,
    required: true
  }
})

defineEmits(['update:modelValue'])

const logLevelOptions = [
  { value: 0, label: 'Error' },
  { value: 1, label: 'Warn' },
  { value: 2, label: 'Info' },
  { value: 3, label: 'Debug' }
]
</script>
