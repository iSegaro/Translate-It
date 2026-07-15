<template>
  <div
    v-if="active"
    class="pdf-region-selection-overlay"
  >
    <div
      v-if="rect"
      class="pdf-region-selection-overlay__rect"
      :style="{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      }"
    />
  </div>
</template>

<script setup>
defineProps({
  active: {
    type: Boolean,
    default: false
  },
  rect: {
    type: Object,
    default: null
  }
})
</script>
