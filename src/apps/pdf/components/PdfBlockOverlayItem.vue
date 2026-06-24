<template>
  <div
    v-if="useCellOverlay"
    class="pdf-block-overlay-item"
    :style="blockContainerStyle"
    data-pdf-overlay-mode="cell"
    :data-pdf-block-id="block.id"
  >
    <template
      v-for="(lineData, lineIdx) in cellOverlayData"
      :key="`cell-line-${lineIdx}`"
    >
      <PdfCellOverlayItem
        v-for="(cell, cellIdx) in lineData.cells"
        :key="`cell-${lineIdx}-${cellIdx}`"
        :cell-text="cell.text"
        :item="cell.item"
        :scale="scale"
        :font-size="blockFontSize"
        :font-family="block.roleMetadata?.fontFamily"
        :ascent="block.roleMetadata?.ascent"
        :descent="block.roleMetadata?.descent"
        :background-color="backgroundColor"
        :data-pdf-line-index="lineIdx"
        :data-pdf-cell-index="cellIdx"
      />
    </template>
  </div>
  <div
    v-else-if="useLineOverlay"
    class="pdf-block-overlay-item"
    :style="blockContainerStyle"
    data-pdf-overlay-mode="line"
    :data-pdf-block-id="block.id"
  >
    <PdfLineOverlayItem
      v-for="(line, index) in lineOverlayData"
      :key="`line-${index}`"
      :line-text="line.text"
      :bounding-box="line.boundingBox"
      :scale="scale"
      :font-size="blockFontSize"
      :font-family="block.roleMetadata?.fontFamily"
      :ascent="block.roleMetadata?.ascent"
      :descent="block.roleMetadata?.descent"
      :background-color="backgroundColor"
      :data-pdf-line-index="index"
    />
  </div>
  <div
    v-else
    class="pdf-block-overlay-item"
    :style="overlayStyle"
    :dir="textDirection"
    data-pdf-overlay-mode="block"
    :data-pdf-block-id="block.id"
  >
    <span
      ref="textRef"
      class="pdf-block-overlay-item__text"
    >{{ translatedText }}</span>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount } from 'vue'
import { resolveFontFamily, resolveAscent, resolveDescent, detectTextDirection, buildOverlayBaseStyle, OVERLAY_BACKGROUND } from '../utils/pdfOverlayTypography.js'
import { sampleCanvasBackgroundColor, clearColorCache } from '../utils/pdfCanvasSampler.js'
import { usePdfTextFitter } from '../composables/usePdfTextFitter.js'
import PdfCellOverlayItem from './PdfCellOverlayItem.vue'
import PdfLineOverlayItem from './PdfLineOverlayItem.vue'

const props = defineProps({
  block: {
    type: Object,
    required: true
  },
  pageMetric: {
    type: Object,
    default: null
  },
  canvas: {
    type: Object,
    default: null
  }
})

const scale = computed(() => props.pageMetric?.scale || 1)

const backgroundColor = computed(() => {
  if (!props.canvas || !props.block.boundingBox) return OVERLAY_BACKGROUND

  return sampleCanvasBackgroundColor(
    props.canvas,
    props.block.boundingBox,
    scale.value,
    props.block.id
  )
})

const overlayBaseStyle = computed(() => buildOverlayBaseStyle(backgroundColor.value))

const translatedText = computed(() => {
  return props.block.translationState?.translatedText || ''
})

const translatedCells = computed(() => {
  return props.block.translationState?.translatedCells || null
})

const blockFontSize = computed(() => {
  return props.block.roleMetadata?.fontSize || 12
})

const fontFamily = computed(() => {
  return resolveFontFamily(props.block.roleMetadata?.fontFamily)
})

const ascent = computed(() => resolveAscent(props.block.roleMetadata?.ascent))

const descent = computed(() => resolveDescent(props.block.roleMetadata?.descent))

const computedLineHeight = computed(() => {
  return ascent.value + descent.value
})

const sourceLineCount = computed(() => {
  return props.block.lines?.length || 0
})

const translatedLines = computed(() => {
  const text = translatedText.value
  if (!text) return []
  return text.split('\n')
})

const useLineOverlay = computed(() => {
  if (sourceLineCount.value <= 1) return false
  if (!props.block.roleMetadata?.isStructured) return false
  if (translatedLines.value.length !== sourceLineCount.value) return false
  return sourceLineCount.value > 1
})

const useCellOverlay = computed(() => {
  if (!translatedCells.value) return false
  const hasMultiCellLine = translatedCells.value.some((lc) => lc.cells && lc.cells.length > 1)
  if (!hasMultiCellLine) return false
  if (sourceLineCount.value <= 1) return true
  return useLineOverlay.value
})

const CELL_GAP_EXPANSION_RATIO = 0.4

const cellOverlayData = computed(() => {
  if (!useCellOverlay.value) return []

  const blockBbox = props.block.boundingBox
  const cells = translatedCells.value || []

  return cells.map((lc) => {
    const line = props.block.lines?.[lc.lineIndex]
    if (!line) return null

    const lineItems = line.items || []
    const lineRight = (line.boundingBox?.x || 0) + (line.boundingBox?.width || 0)
    return {
      cells: lc.cells.map((cellText, cellIdx) => {
        const item = lineItems[cellIdx]
        if (!item) return null

        const isLastCell = cellIdx === lc.cells.length - 1
        let cellWidth

        if (isLastCell) {
          cellWidth = lineRight - item.x
        } else {
          const nextItem = lineItems[cellIdx + 1]
          const itemRight = item.right ?? (item.x + item.width)
          const gap = nextItem ? nextItem.x - itemRight : 0
          const expansion = Math.max(0, gap * CELL_GAP_EXPANSION_RATIO)
          cellWidth = item.width + expansion
        }

        cellWidth = Math.max(item.width, cellWidth)

        return {
          text: cellText,
          item: {
            x: item.x - blockBbox.x,
            y: item.y - blockBbox.y,
            width: cellWidth,
            height: item.height
          }
        }
      }).filter(Boolean)
    }
  }).filter(Boolean)
})

const lineOverlayData = computed(() => {
  if (!useLineOverlay.value) return []

  const blockBbox = props.block.boundingBox
  return props.block.lines.map((line, index) => {
    const lineBbox = line.boundingBox || blockBbox
    return {
      text: translatedLines.value[index] || '',
      boundingBox: {
        x: lineBbox.x - blockBbox.x,
        y: lineBbox.y - blockBbox.y,
        width: lineBbox.width,
        height: lineBbox.height
      }
    }
  })
})

const blockContainerStyle = computed(() => {
  const bbox = props.block.boundingBox
  if (!bbox) return {}

  return {
    position: 'absolute',
    left: `${bbox.x * scale.value}px`,
    top: `${bbox.y * scale.value}px`,
    width: `${bbox.width * scale.value}px`,
    height: `${bbox.height * scale.value}px`
  }
})

const textDirection = computed(() => detectTextDirection(translatedText.value))

const bboxWidth = computed(() => props.block.boundingBox?.width || 0)
const bboxHeight = computed(() => props.block.boundingBox?.height || 0)

const { textRef, resolvedFontSize } = usePdfTextFitter({
  width: bboxWidth,
  height: bboxHeight,
  scale,
  fontSize: blockFontSize,
  watchDeps: [translatedText]
})

onBeforeUnmount(() => {
  clearColorCache(props.block.id)
})

const overlayStyle = computed(() => {
  const bbox = props.block.boundingBox
  if (!bbox) return {}

  return {
    position: 'absolute',
    left: `${bbox.x * scale.value}px`,
    top: `${bbox.y * scale.value}px`,
    width: `${bbox.width * scale.value}px`,
    height: `${bbox.height * scale.value}px`,
    fontSize: `${resolvedFontSize.value}px`,
    fontFamily: fontFamily.value,
    lineHeight: `${computedLineHeight.value}`,
    ...overlayBaseStyle.value
  }
})
</script>

<style scoped>
.pdf-block-overlay-item__text {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
