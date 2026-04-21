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
      class="ti-btn__text"
    >
      <slot>{{ text }}</slot>
    </span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import './BaseButton.scss'
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
  'ti-btn',
  `ti-btn--${props.variant}`,
  `ti-btn--${props.size}`,
  {
    'ti-btn--disabled': props.disabled || props.loading,
    'ti-btn--loading': props.loading,
    'ti-btn--full-width': props.fullWidth,
    'ti-btn--icon-only': props.icon && !props.text && !(props.$slots && props.$slots.default),
    'ti-btn--has-icon': props.icon,
    [`ti-btn--icon-${props.iconPosition}`]: props.icon
  }
])

const iconClasses = computed(() => [
  'ti-btn__icon',
  {
    'ti-btn__icon--right': props.iconPosition === 'left' && (props.text || (props.$slots && props.$slots.default)),
    'ti-btn__icon--left': props.iconPosition === 'right' && (props.text || (props.$slots && props.$slots.default))
  }
])

const handleClick = (event) => {
  if (!props.disabled && !props.loading) {
    emit('click', event)
  }
}
</script>
