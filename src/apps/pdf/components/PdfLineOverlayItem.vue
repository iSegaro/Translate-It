<template>
  <div
    class="pdf-line-overlay-item"
    :style="lineStyle"
    :dir="textDirection"
  >
    <span class="pdf-line-overlay-item__text">{{ lineText }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { resolvePdfFontFamily } from '../utils/pdfFontMap.js'

const OVERLAY_BACKGROUND = 'rgb(255, 255, 255)'
const DEFAULT_ASCENT = 0.8

const props = defineProps({
  lineText: {
    type: String,
    required: true
  },
  boundingBox: {
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
  }
})

const resolvedFontFamily = computed(() => resolvePdfFontFamily(props.fontFamily))

const scaledFontSize = computed(() => props.fontSize * props.scale)

const resolvedAscent = computed(() => {
  return props.ascent != null && Number.isFinite(props.ascent) ? props.ascent : DEFAULT_ASCENT
})

const resolvedDescent = computed(() => {
  return props.descent != null && Number.isFinite(props.descent) ? Math.abs(props.descent) : 0.2
})

const computedLineHeight = computed(() => resolvedAscent.value + resolvedDescent.value)

const textDirection = computed(() => {
  const text = props.lineText
  if (!text) return 'ltr'

  const rtlChars = text.match(/[\u0591-\u05FF\u0600-\u06FF\u0700-\u074F]/g)
  const ltrChars = text.match(/[a-zA-Z\u00C0-\u024F]/g)

  const rtlCount = rtlChars?.length || 0
  const ltrCount = ltrChars?.length || 0

  return rtlCount > ltrCount ? 'rtl' : 'ltr'
})

const lineStyle = computed(() => {
  const bbox = props.boundingBox
  if (!bbox) return {}

  return {
    position: 'absolute',
    left: `${bbox.x * props.scale}px`,
    top: `${bbox.y * props.scale}px`,
    width: `${bbox.width * props.scale}px`,
    height: `${bbox.height * props.scale}px`,
    fontSize: `${scaledFontSize.value}px`,
    fontFamily: resolvedFontFamily.value,
    lineHeight: `${computedLineHeight.value}`,
    overflow: 'hidden',
    boxSizing: 'border-box',
    background: OVERLAY_BACKGROUND,
    pointerEvents: 'auto',
    userSelect: 'text',
    willChange: 'transform'
  }
})
</script>

<style scoped>
.pdf-line-overlay-item__text {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
