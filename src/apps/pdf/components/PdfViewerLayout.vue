<template>
  <div
    class="pdf-viewer-layout"
    :class="layoutClasses"
  >
    <div
      v-if="showOriginalPane"
      ref="originalPaneRef"
      class="pdf-viewer-layout__pane pdf-viewer-layout__pane--original"
      tabindex="-1"
      @click="focusPane"
    >
      <slot name="original" />
    </div>

    <div
      v-if="showTranslatedPane"
      ref="translatedPaneRef"
      class="pdf-viewer-layout__pane pdf-viewer-layout__pane--translated"
    >
      <slot name="translated" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { LAYOUT_MODE } from '../composables/usePdfViewerMode.js'
import { usePdfScrollSync } from '../composables/usePdfScrollSync.js'
import './PdfViewerLayout.scss'

const props = defineProps({
  layoutMode: {
    type: String,
    default: LAYOUT_MODE.SINGLE
  },
  showOriginalPane: {
    type: Boolean,
    default: true
  },
  showTranslatedPane: {
    type: Boolean,
    default: true
  }
})

const originalPaneRef = ref(null)
const translatedPaneRef = ref(null)

const INTERACTIVE_TAGS = new Set(['button', 'input', 'textarea', 'select', 'a'])

function focusPane(event) {
  const target = event.target
  if (target instanceof HTMLElement) {
    const tag = target.tagName.toLowerCase()
    if (INTERACTIVE_TAGS.has(tag)) {
      return
    }
    if (target.isContentEditable) {
      return
    }
  }

  const pane = originalPaneRef.value
  if (pane && document.activeElement !== pane) {
    pane.focus({ preventScroll: true })
  }
}

const layoutClasses = computed(() => ({
  'pdf-viewer-layout--single': props.layoutMode === LAYOUT_MODE.SINGLE,
  'pdf-viewer-layout--side-by-side': props.layoutMode === LAYOUT_MODE.SIDE_BY_SIDE
}))

const { syncFromPane, syncNow } = usePdfScrollSync(
  originalPaneRef,
  translatedPaneRef,
  computed(() => props.layoutMode === LAYOUT_MODE.SIDE_BY_SIDE && props.showOriginalPane && props.showTranslatedPane)
)

defineExpose({
  scrollContainer: originalPaneRef,
  translatedPaneRef,
  syncFromPane,
  syncNow
})
</script>

