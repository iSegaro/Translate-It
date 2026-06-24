<template>
  <div
    class="pdf-cell-overlay-item"
    :style="cellStyle"
    :dir="textDirection"
  >
    <span
      ref="textRef"
      class="pdf-cell-overlay-item__text"
    >{{ cellText }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { resolveFontFamily, computeLineHeight, detectTextDirection, buildOverlayBaseStyle, buildOverlayPositionStyle, OVERLAY_BACKGROUND } from '../utils/pdfOverlayTypography.js'
import { usePdfTextFitter } from '../composables/usePdfTextFitter.js'

const props = defineProps({
  cellText: {
    type: String,
    required: true
  },
  item: {
    type: Object,
    required: true
  },
  scale: {
    type: Number,
    default: 1
  },
  fontSize: {
    type: Number,
    default: 12
  },
  fontFamily: {
    type: String,
    default: null
  },
  ascent: {
    type: Number,
    default: null
  },
  descent: {
    type: Number,
    default: null
  },
  backgroundColor: {
    type: String,
    default: OVERLAY_BACKGROUND
  }
})

const scaleRef = computed(() => props.scale)
const fontSizeRef = computed(() => props.fontSize)
const widthRef = computed(() => props.item?.width || 0)
const heightRef = computed(() => props.item?.height || 0)

const { textRef, resolvedFontSize } = usePdfTextFitter({
  width: widthRef,
  height: heightRef,
  scale: scaleRef,
  fontSize: fontSizeRef,
  watchDeps: [() => props.cellText]
})

const textDirection = computed(() => detectTextDirection(props.cellText))

const cellStyle = computed(() => ({
  ...buildOverlayPositionStyle(props.item, props.scale),
  ...buildOverlayBaseStyle(props.backgroundColor),
  contain: 'paint',
  fontSize: `${resolvedFontSize.value}px`,
  fontFamily: resolveFontFamily(props.fontFamily),
  lineHeight: `${computeLineHeight(props.ascent, props.descent)}`,
  textAlign: 'left',
  padding: '0 1px'
}))
</script>

<style scoped>
.pdf-cell-overlay-item__text {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
