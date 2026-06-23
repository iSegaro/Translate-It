<template>
  <div
    v-if="visible && translatedBlocks.length > 0"
    class="pdf-overlay-layer"
  >
    <PdfBlockOverlayItem
      v-for="block in translatedBlocks"
      :key="block.id"
      :block="block"
      :page-metric="pageMetric"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import PdfBlockOverlayItem from './PdfBlockOverlayItem.vue'

const props = defineProps({
  blocks: {
    type: Array,
    default: () => []
  },
  pageMetric: {
    type: Object,
    default: null
  },
  visible: {
    type: Boolean,
    default: false
  }
})

const translatedBlocks = computed(() => {
  return props.blocks.filter((block) => {
    const state = block.translationState
    return state && state.status === 'translated' && state.translatedText
  })
})
</script>

<style scoped>
.pdf-overlay-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}
</style>
