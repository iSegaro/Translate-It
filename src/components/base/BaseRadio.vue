<template>
  <label class="base-radio" :class="{ disabled }">
    <input
      type="radio"
      :name="name"
      :value="value"
      :checked="modelValue === value"
      :disabled="disabled"
      @change="$emit('update:modelValue', value)"
    />
    <span v-if="label" class="radio-label">{{ label }}</span>
    <slot v-else />
  </label>
</template>

<script setup>
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

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.base-radio {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  cursor: pointer;
  font-size: $font-size-base;
  margin: 0;
  
  input[type="radio"] {
    margin: 0;
    width: 16px;
    height: 16px;
    cursor: pointer;
    flex-shrink: 0;
  }
  
  .radio-label {
    flex: 1;
    color: var(--color-text);
  }
  
  &.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    
    input[type="radio"] {
      cursor: not-allowed;
    }
  }
}
</style>