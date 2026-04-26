<template>
  <button
    type="button"
    :class="buttonClasses"
    :disabled="disabled"
    :title="title"
    :aria-label="ariaLabel"
    @click="$emit('click', $event)"
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
import './BaseActionButton.scss';
import { computed } from 'vue';

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