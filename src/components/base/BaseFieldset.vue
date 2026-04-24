<template>
  <fieldset
    class="base-fieldset"
    :class="{ disabled, 'has-header': $slots.header }"
  >
    <legend 
      v-if="legend" 
      class="base-fieldset__legend"
    >
      <span class="legend-text">{{ legend }}</span>
    </legend>

    <div 
      v-if="$slots.header" 
      class="base-fieldset__header-actions"
    >
      <slot name="header" />
    </div>

    <div class="base-fieldset__content">
      <slot />
    </div>
  </fieldset>
</template>

<script setup>
import './BaseFieldset.scss'

/**
 * BaseFieldset - A standardized fieldset component for grouping related settings.
 * Supports an optional 'header' slot for actions (like ProviderSelector) 
 * that will be positioned on the right side of the legend/border.
 */
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
