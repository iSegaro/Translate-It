<template>
  <fieldset
    class="base-fieldset"
    :class="{ disabled }"
  >
    <legend 
      v-if="legend || $slots.header" 
      class="base-fieldset__legend"
      :class="{ 'has-header': $slots.header }"
    >
      <div class="legend-container">
        <span 
          v-if="legend" 
          class="legend-text"
        >{{ legend }}</span>
        <div 
          v-if="$slots.header" 
          class="legend-actions"
        >
          <slot name="header" />
        </div>
      </div>
    </legend>
    <slot />
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
