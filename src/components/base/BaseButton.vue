<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="buttonClasses"
    @click="handleClick"
  >
    <LoadingSpinner
      v-if="loading"
      size="xs"
      :variant="variant === 'primary' ? 'neutral' : 'primary'"
    />
    
    <span
      v-if="icon && !loading"
      :class="iconClasses"
    >
      <slot name="icon">
        <i :class="`icon-${icon}`" />
      </slot>
    </span>
    
    <span
      v-if="$slots.default || text"
      class="button-text"
    >
      <slot>{{ text }}</slot>
    </span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'

const props = defineProps({
  type: {
    type: String,
    default: 'button',
    validator: (value) => ['button', 'submit', 'reset'].includes(value)
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'outline', 'ghost', 'danger'].includes(value)
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['xs', 'sm', 'md', 'lg'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  icon: {
    type: String,
    default: null
  },
  iconPosition: {
    type: String,
    default: 'left',
    validator: (value) => ['left', 'right'].includes(value)
  },
  text: {
    type: String,
    default: null
  },
  fullWidth: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['click'])

const buttonClasses = computed(() => [
  'base-button',
  `variant-${props.variant}`,
  `size-${props.size}`,
  {
    'disabled': props.disabled || props.loading,
    'loading': props.loading,
    'full-width': props.fullWidth,
    'icon-only': props.icon && !props.text && !(props.$slots && props.$slots.default),
    'has-icon': props.icon,
    [`icon-${props.iconPosition}`]: props.icon
  }
])

const iconClasses = computed(() => [
  'button-icon',
  {
    'mr-2': props.iconPosition === 'left' && (props.text || (props.$slots && props.$slots.default)),
    'ml-2': props.iconPosition === 'right' && (props.text || (props.$slots && props.$slots.default))
  }
])

const handleClick = (event) => {
  if (!props.disabled && !props.loading) {
    emit('click', event)
  }
}
</script>

<style scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--border-radius-base);
  font-family: inherit;
  font-weight: var(--font-weight-medium);
  text-decoration: none;
  cursor: pointer;
  transition: all var(--transition-base);
  position: relative;
  white-space: nowrap;
  
  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--color-primary), 0 0 0 4px rgba(25, 118, 210, 0.1);
  }
  
  &.disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  
  &.loading {
    cursor: wait;
  }
  
  &.full-width {
    width: 100%;
  }
}

/* Sizes */
.size-xs {
  padding: 4px 8px;
  font-size: var(--font-size-xs);
  
  &.icon-only {
    padding: 4px;
    width: 24px;
    height: 24px;
  }
}

.size-sm {
  padding: 6px 12px;
  font-size: var(--font-size-sm);
  
  &.icon-only {
    padding: 6px;
    width: 32px;
    height: 32px;
  }
}

.size-md {
  padding: 8px 16px;
  font-size: var(--font-size-base);
  
  &.icon-only {
    padding: 8px;
    width: 40px;
    height: 40px;
  }
}

.size-lg {
  padding: 12px 20px;
  font-size: var(--font-size-md);
  
  &.icon-only {
    padding: 12px;
    width: 48px;
    height: 48px;
  }
}

/* Variants */
.variant-primary {
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
  
  &:hover:not(.disabled) {
    background-color: var(--color-primary-dark);
    border-color: var(--color-primary-dark);
  }
  
  &:active:not(.disabled) {
    transform: translateY(1px);
  }
}

.variant-secondary {
  background-color: var(--color-secondary);
  color: white;
  border-color: var(--color-secondary);
  
  &:hover:not(.disabled) {
    background-color: var(--color-secondary-dark);
    border-color: var(--color-secondary-dark);
  }
  
  &:active:not(.disabled) {
    transform: translateY(1px);
  }
}

.variant-outline {
  background-color: transparent;
  color: var(--color-primary);
  border-color: var(--color-primary);
  
  &:hover:not(.disabled) {
    background-color: var(--color-primary);
    color: white;
  }
  
  &:active:not(.disabled) {
    transform: translateY(1px);
  }
}

.variant-ghost {
  background-color: transparent;
  color: var(--color-text);
  border-color: transparent;
  
  &:hover:not(.disabled) {
    background-color: var(--color-surface);
  }
  
  &:active:not(.disabled) {
    transform: translateY(1px);
  }
}

.variant-danger {
  background-color: var(--color-error);
  color: white;
  border-color: var(--color-error);
  
  &:hover:not(.disabled) {
    background-color: #d32f2f;
    border-color: #d32f2f;
  }
  
  &:active:not(.disabled) {
    transform: translateY(1px);
  }
}

/* Icon positioning */
.icon-right {
  flex-direction: row-reverse;
}

.button-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.button-text {
  flex: 1;
  text-align: center;
}

/* Responsive adjustments */
@media (max-width: 480px) {
  .base-button {
    min-height: 44px; /* Touch target size */
  }
}
</style>