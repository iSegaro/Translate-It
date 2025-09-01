<template>
  <div
    class="action-group"
    :class="[
      `layout-${layout}`,
      `spacing-${spacing}`,
      { 'bordered': bordered, 'elevated': elevated }
    ]"
  >
    <slot />
  </div>
</template>

<script setup>
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

<style scoped>
.action-group {
  display: flex;
  align-items: center;
}

/* Layout variants */
.layout-horizontal {
  flex-direction: row;
}

.layout-vertical {
  flex-direction: column;
}

/* Spacing variants */
.spacing-tight {
  gap: 2px;
}

.spacing-normal {
  gap: 4px;
}

.spacing-loose {
  gap: 8px;
}

/* Style variants */
.bordered {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  padding: 2px;
}

.elevated {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  padding: 2px;
  background: rgba(255, 255, 255, 0.9);
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .bordered {
    border-color: rgba(255, 255, 255, 0.1);
  }
  
  .elevated {
    background: rgba(0, 0, 0, 0.9);
    box-shadow: 0 1px 3px rgba(255, 255, 255, 0.1);
  }
}
</style>
