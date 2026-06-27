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
      :canvas="canvas"
      :mask-map="maskMap"
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
  },
  canvas: {
    type: Object,
    default: null
  },
  pageMaskModel: {
    type: Object,
    default: null
  }
})

const translatedBlocks = computed(() => {
  return props.blocks.filter((block) => {
    const state = block.translationState
    return state && state.status === 'translated' && state.translatedText
  })
})

const maskMap = computed(() => {
  const masks = props.pageMaskModel?.masks
  if (!masks || !masks.length) return null

  const map = new Map()
  for (const mask of masks) {
    if (!map.has(mask.ownerId)) {
      map.set(mask.ownerId, mask)
    }
  }
  return map
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
