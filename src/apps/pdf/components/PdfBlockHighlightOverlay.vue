<template>
  <div
    v-if="visible"
    class="pdf-block-highlight-overlay"
    :style="overlayStyle"
  />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  blockBounds: {
    type: Object,
    default: null
  },
  pageNumber: {
    type: Number,
    default: 0
  },
  pageOffset: {
    type: Number,
    default: 0
  }
})

const visible = computed(() => {
  return props.blockBounds !== null && props.blockBounds.pageNumber === props.pageNumber
})

const overlayStyle = computed(() => {
  if (!props.blockBounds) return {}

  return {
    left: `${props.blockBounds.x}px`,
    top: `${props.blockBounds.y - props.pageOffset}px`,
    width: `${props.blockBounds.width}px`,
    height: `${props.blockBounds.height}px`
  }
})
</script>

<style scoped lang="scss">
.pdf-block-highlight-overlay {
  position: absolute;
  pointer-events: none;
  border: 2px solid rgba(90, 92, 255, 0.7);
  border-radius: 4px;
  background: rgba(90, 92, 255, 0.08);
  z-index: 10;
  transition: left 0.05s ease, top 0.05s ease, width 0.05s ease, height 0.05s ease;
}
</style>
