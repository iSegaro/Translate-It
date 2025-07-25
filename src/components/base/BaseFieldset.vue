<template>
  <fieldset class="base-fieldset" :class="{ disabled }">
    <legend v-if="legend">{{ legend }}</legend>
    <slot />
  </fieldset>
</template>

<script setup>
defineProps({
  legend: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.base-fieldset {
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-md;
  padding: 1.5em 1em 1em 1em;
  margin-bottom: $spacing-xl;
  position: relative;
  
  legend {
    padding: 0 0.5em;
    margin-left: 0.5em;
    font-weight: $font-weight-semibold;
    color: var(--color-text-secondary);
    font-size: $font-size-sm;
  }
  
  &.disabled {
    opacity: 0.6;
    pointer-events: none;
  }
}

// Remove border from last setting group in fieldset
.base-fieldset :deep(.setting-group:last-of-type) {
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
}
</style>