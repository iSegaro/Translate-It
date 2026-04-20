<template>
  <fieldset
    class="base-fieldset"
    :class="{ disabled }"
  >
    <legend v-if="legend">
      {{ legend }}
    </legend>
    <slot />
  </fieldset>
</template>

<script setup>
import './BaseFieldset.scss'
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
