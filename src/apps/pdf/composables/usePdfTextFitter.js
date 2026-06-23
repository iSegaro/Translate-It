import { computed, onMounted, ref, watch, nextTick } from 'vue'

const MIN_FONT_SCALE = 0.6
const FIT_DECREMENT = 0.05

/**
 * Shared adaptive font-fitting logic for PDF overlay text elements.
 *
 * Measures the rendered text via getBoundingClientRect and incrementally
 * reduces font-size until the text fits inside its container, or reaches
 * the minimum scale threshold.
 *
 * @param {object} options
 * @param {import('vue').ComputedRef<number>} options.width  - unscaled container width
 * @param {import('vue').ComputedRef<number>} options.height - unscaled container height
 * @param {import('vue').ComputedRef<number>} options.scale  - current zoom scale
 * @param {import('vue').ComputedRef<number>} options.fontSize - base font size (unscaled)
 * @param {Array} [options.watchDeps] - extra reactive values that should trigger a re-fit
 *   (e.g. translated text, bounding box coordinates)
 * @returns {{ textRef: import('vue').Ref, resolvedFontSize: import('vue').ComputedRef, fitTextToBox: () => Promise<void> }}
 */
export function usePdfTextFitter({ width, height, scale, fontSize, watchDeps = [] }) {
  const textRef = ref(null)
  const currentFontScale = ref(1)

  const resolvedFontSize = computed(() => fontSize.value * scale.value * currentFontScale.value)

  async function fitTextToBox() {
    await nextTick()
    if (!textRef.value) return

    const containerWidth = width.value * scale.value
    const containerHeight = height.value * scale.value

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
    () => [width.value, height.value, scale.value, fontSize.value, ...watchDeps.map((dep) => (typeof dep === 'function' ? dep() : dep))],
    () => {
      currentFontScale.value = 1
      fitTextToBox()
    }
  )

  return { textRef, resolvedFontSize, fitTextToBox }
}
