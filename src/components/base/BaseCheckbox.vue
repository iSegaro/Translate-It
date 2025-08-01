<template>
  <label
    class="base-checkbox"
    :class="{ disabled }"
  >
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.checked)"
    >
    <span
      v-if="label"
      class="checkbox-label"
    >{{ label }}</span>
    <slot v-else />
  </label>
</template>

<script setup>
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

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.base-checkbox {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  cursor: pointer;
  font-size: $font-size-base;
  margin: 0;
  
  input[type="checkbox"] {
    margin: 0;
    width: 16px;
    height: 16px;
    cursor: pointer;
    flex-shrink: 0;
  }
  
  .checkbox-label {
    flex: 1;
    color: var(--color-text);
  }
  
  &.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    
    input[type="checkbox"] {
      cursor: not-allowed;
    }
  }
}
</style>