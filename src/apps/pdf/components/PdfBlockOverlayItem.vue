<template>
  <div
    v-if="useLineOverlay"
    class="pdf-block-overlay-item"
    :style="blockContainerStyle"
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
    />
  </div>
  <div
    v-else
    class="pdf-block-overlay-item"
    :style="overlayStyle"
    :dir="textDirection"
  >
    <span
      ref="textRef"
      class="pdf-block-overlay-item__text"
    >{{ translatedText }}</span>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { resolvePdfFontFamily } from '../utils/pdfFontMap.js'
import PdfLineOverlayItem from './PdfLineOverlayItem.vue'

const MIN_FONT_SCALE = 0.6
const FIT_DECREMENT = 0.05
const OVERLAY_BACKGROUND = 'rgb(255, 255, 255)'
const DEFAULT_ASCENT = 0.8

const props = defineProps({
  block: {
    type: Object,
    required: true
  },
  pageMetric: {
    type: Object,
    default: null
  }
})

const textRef = ref(null)
const currentFontScale = ref(1)

const scale = computed(() => props.pageMetric?.scale || 1)

const translatedText = computed(() => {
  return props.block.translationState?.translatedText || ''
})

const blockFontSize = computed(() => {
  return props.block.roleMetadata?.fontSize || 12
})

const scaledFontSize = computed(() => {
  return blockFontSize.value * scale.value * currentFontScale.value
})

const fontFamily = computed(() => {
  return resolvePdfFontFamily(props.block.roleMetadata?.fontFamily)
})

const ascent = computed(() => {
  const val = props.block.roleMetadata?.ascent
  return val != null && Number.isFinite(val) ? val : DEFAULT_ASCENT
})

const descent = computed(() => {
  const val = props.block.roleMetadata?.descent
  return val != null && Number.isFinite(val) ? Math.abs(val) : 0.2
})

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

const textDirection = computed(() => {
  const text = translatedText.value
  if (!text) return 'ltr'

  const rtlChars = text.match(/[\u0591-\u05FF\u0600-\u06FF\u0700-\u074F]/g)
  const ltrChars = text.match(/[a-zA-Z\u00C0-\u024F]/g)

  const rtlCount = rtlChars?.length || 0
  const ltrCount = ltrChars?.length || 0

  return rtlCount > ltrCount ? 'rtl' : 'ltr'
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
    fontSize: `${scaledFontSize.value}px`,
    fontFamily: fontFamily.value,
    lineHeight: `${computedLineHeight.value}`,
    overflow: 'hidden',
    boxSizing: 'border-box',
    background: OVERLAY_BACKGROUND,
    pointerEvents: 'auto',
    // TODO: When isBlockTargetingActive is propagated to overlay items,
    // set pointerEvents to 'none' during targeting to prevent selection
    // from interfering with block hover/click detection.
    userSelect: 'text',
    willChange: 'transform'
  }
})

async function fitTextToBox() {
  await nextTick()
  if (!textRef.value) return

  const bbox = props.block.boundingBox
  if (!bbox) return

  const containerWidth = bbox.width * scale.value
  const containerHeight = bbox.height * scale.value

  if (containerWidth <= 0 || containerHeight <= 0) return

  const el = textRef.value
  const measured = el.getBoundingClientRect()
  if (measured.width <= 0 || measured.height <= 0) return

  if (measured.width <= containerWidth && measured.height <= containerHeight) {
    return
  }

  let fontScale = 1
  while (fontScale > MIN_FONT_SCALE) {
    fontScale -= FIT_DECREMENT
    currentFontScale.value = fontScale
    await nextTick()

    const newMeasured = el.getBoundingClientRect()
    if (newMeasured.width <= containerWidth && newMeasured.height <= containerHeight) {
      return
    }
  }

  currentFontScale.value = MIN_FONT_SCALE
}

onMounted(() => {
  fitTextToBox()
})

watch(
  () => [
    translatedText.value,
    scale.value,
    props.block.boundingBox?.x,
    props.block.boundingBox?.y,
    props.block.boundingBox?.width,
    props.block.boundingBox?.height,
    blockFontSize.value
  ],
  () => {
    currentFontScale.value = 1
    fitTextToBox()
  }
)
</script>

<style scoped>
.pdf-block-overlay-item__text {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
