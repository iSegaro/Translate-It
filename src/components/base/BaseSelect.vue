<template>
  <select
    :value="modelValue"
    :class="['ti-select', { 'ti-select--disabled': disabled }]"
    :disabled="disabled"
    v-bind="$attrs"
    @change="handleChange"
  >
    <option
      v-for="option in options"
      :key="option.value"
      :value="option.value"
    >
      {{ option.label || option.name }}
    </option>
  </select>
</template>

<script setup>
import './BaseSelect.scss'
defineOptions({
  inheritAttrs: false
})

defineProps({
  modelValue: {
    type: [String, Number, Boolean],
    required: true
  },
  options: {
    type: Array,
    required: true,
    validator: (options) => {
      return options.every(option => 
        typeof option === 'object' && 
        option !== null && 
        'value' in option && 
        ('label' in option || 'name' in option)
      )
    }
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const handleChange = (event) => {
  const value = event.target.value
  emit('update:modelValue', value)
  emit('change', value)
}
</script>
