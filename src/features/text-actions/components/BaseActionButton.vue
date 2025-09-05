<template>
  <button
    type="button"
    :class="buttonClasses"
    :disabled="disabled"
    :title="title"
    :aria-label="ariaLabel"
    @click="$emit('click')"
  >
    <slot name="icon" />
    <span
      v-if="showLabel"
      class="button-label"
    >
      <slot name="label">{{ label }}</slot>
    </span>
    <slot name="feedback" />
  </button>
</template>

<script setup>
import { computed } from 'vue'

// Props
const props = defineProps({
  size: {
    type: String,
    default: 'sm',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  },
  variant: {
    type: String,
    default: 'secondary',
    validator: (value) => ['primary', 'secondary'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  },
  ariaLabel: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  showLabel: {
    type: Boolean,
    default: false
  },
  customClasses: {
    type: Array,
    default: () => []
  }
})

// Emits
defineEmits(['click'])

// Computed
const buttonClasses = computed(() => [
  'base-action-button',
  `size-${props.size}`,
  `variant-${props.variant}`,
  {
    'disabled': props.disabled,
    'has-label': props.showLabel
  },
  ...props.customClasses
])
</script>

<style scoped>
/* Base Action Button Styles */
.base-action-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
  user-select: none;
  font-family: inherit;
  outline: none;
}

.base-action-button:focus {
  outline: 2px solid var(--focus-color, #007bff);
  outline-offset: 2px;
}

.base-action-button:hover:not(.disabled) {
  background-color: var(--color-background-hover, rgba(0, 0, 0, 0.1));
}

.base-action-button:active:not(.disabled) {
  transform: scale(0.95);
}

.base-action-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Size variants */
.size-sm {
  padding: 2px;
  min-width: 20px;
  min-height: 20px;
  font-size: 12px;
  gap: 4px;
}

.size-md {
  padding: 6px;
  min-width: 32px;
  min-height: 32px;
  font-size: 14px;
  gap: 6px;
}

.size-lg {
  padding: 8px;
  min-width: 40px;
  min-height: 40px;
  font-size: 16px;
  gap: 8px;
}

/* Variant styles */
.variant-primary {
  background-color: var(--primary-color, #007bff);
  color: white;
  border: 1px solid var(--primary-color, #007bff);
}

.variant-primary:hover:not(.disabled) {
  background-color: var(--primary-color-hover, #0056b3);
}

.variant-secondary {
  background-color: transparent;
  color: var(--text-color, #333);
  border: 1px solid transparent;
  margin: 0 1px;
}

.variant-secondary:hover:not(.disabled) {
  background-color: var(--color-background-hover, rgba(0, 0, 0, 0.1));
  border-color: var(--color-background-hover, rgba(0, 0, 0, 0.1));
}

/* Label */
.button-label {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .variant-secondary {
    border-color: rgba(255, 255, 255, 0.2);
    background-color: rgba(0, 0, 0, 0.9);
  }
}
</style>