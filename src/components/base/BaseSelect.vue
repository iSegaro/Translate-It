<template>
  <select
    :value="modelValue"
    :class="['base-select', { disabled: disabled }]"
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

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.base-select {
  width: 100%;
  padding: $spacing-sm $spacing-base;
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-base;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: inherit;
  font-size: $font-size-base;
  line-height: 1.5;
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
  background-position: right $spacing-sm center;
  background-repeat: no-repeat;
  background-size: 1.5em 1.5em;
  padding-right: 2.5em;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    border-color: var(--color-border-hover);
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.1);
  }

  &:disabled,
  &.disabled {
    background-color: var(--color-background-muted);
    color: var(--color-text-muted);
    cursor: not-allowed;
    opacity: 0.6;
  }

  option {
    background-color: var(--color-background);
    color: var(--color-text);
    padding: $spacing-xs $spacing-sm;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .base-select {
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%9ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
  }
}

</style>