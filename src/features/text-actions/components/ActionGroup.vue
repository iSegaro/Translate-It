<template>
  <div
    class="ti-action-group"
    :class="[
      `ti-layout-${layout}`,
      `ti-spacing-${spacing}`,
      { 'ti-bordered': bordered, 'ti-elevated': elevated }
    ]"
  >
    <slot />
  </div>
</template>

<script setup>
import './ActionGroup.scss';
// Props
defineProps({
  layout: {
    type: String,
    default: 'horizontal',
    validator: (value) => ['horizontal', 'vertical'].includes(value)
  },
  spacing: {
    type: String,
    default: 'normal',
    validator: (value) => ['tight', 'normal', 'loose'].includes(value)
  },
  bordered: {
    type: Boolean,
    default: false
  },
  elevated: {
    type: Boolean,
    default: false
  }
})
</script>
