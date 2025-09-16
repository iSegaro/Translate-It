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
.ti-action-group {
  display: flex;
  align-items: center;
}

/* Layout variants */
.ti-layout-horizontal {
  flex-direction: row;
}

.ti-layout-vertical {
  flex-direction: column;
}

/* Spacing variants */
.ti-spacing-tight {
  gap: 2px;
}

.ti-spacing-normal {
  gap: 4px;
}

.ti-spacing-loose {
  gap: 8px;
}

/* Style variants */
.ti-bordered {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  padding: 2px;
}

.ti-elevated {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  padding: 2px;
  background: rgba(255, 255, 255, 0.9);
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .ti-bordered {
    border-color: rgba(255, 255, 255, 0.1);
  }

  .ti-elevated {
    background: rgba(0, 0, 0, 0.9);
    box-shadow: 0 1px 3px rgba(255, 255, 255, 0.1);
  }
}
</style>
