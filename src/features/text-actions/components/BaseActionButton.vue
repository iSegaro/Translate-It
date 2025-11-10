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
      class="ti-button-label"
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
  'ti-base-action-button',
  `ti-size-${props.size}`,
  `ti-variant-${props.variant}`,
  {
    'ti-disabled': props.disabled,
    'ti-has-label': props.showLabel
  },
  ...props.customClasses
])
</script>

<style scoped>
/* Base Action Button Styles */
.ti-base-action-button {
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

.ti-base-action-button:focus {
  outline: 2px solid var(--focus-color, #007bff);
  outline-offset: 2px;
}

.ti-base-action-button:hover:not(.ti-disabled) {
  background-color: var(--color-background-hover, rgba(0, 0, 0, 0.1));
}

.ti-base-action-button:active:not(.ti-disabled) {
  transform: scale(0.95);
}

.ti-base-action-button.ti-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Size variants */
.ti-size-sm {
  padding: 2px;
  min-width: 20px;
  min-height: 20px;
  font-size: 12px;
  gap: 4px;
}

.ti-size-md {
  padding: 6px;
  min-width: 32px;
  min-height: 32px;
  font-size: 14px;
  gap: 6px;
}

.ti-size-lg {
  padding: 8px;
  min-width: 40px;
  min-height: 40px;
  font-size: 16px;
  gap: 8px;
}

/* Variant styles */
.ti-variant-primary {
  background-color: var(--color-primary, #007bff);
  color: white;
  border: 1px solid var(--color-primary, #007bff);
}

.ti-variant-primary:hover:not(.ti-disabled) {
  background-color: var(--color-primary-dark, #0056b3);
}

.ti-variant-secondary {
  background-color: transparent;
  color: var(--color-text, #333);
  border: 1px solid transparent;
  margin: 0 1px;
  opacity: var(--icon-opacity, 0.8);
  transition: all 0.2s ease, opacity 0.2s ease;
}

.ti-variant-secondary:hover:not(.ti-disabled) {
  background-color: var(--color-background-hover, rgba(0, 0, 0, 0.1));
  border-color: var(--color-border, rgba(0, 0, 0, 0.1));
  opacity: var(--icon-hover-opacity, 1);
}

/* Label */
.ti-button-label {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

/* Dark mode support - remove background for icon-only display */
:root.theme-dark .ti-variant-secondary,
.theme-dark .ti-variant-secondary {
  border-color: transparent;
  background-color: transparent;
}

:root.theme-dark .ti-variant-secondary:hover:not(.ti-disabled),
.theme-dark .ti-variant-secondary:hover:not(.ti-disabled) {
  background-color: var(--color-background-hover, rgba(255, 255, 255, 0.1));
  border-color: transparent;
}
</style>