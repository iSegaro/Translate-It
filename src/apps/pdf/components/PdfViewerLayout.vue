<template>
  <div
    class="pdf-viewer-layout"
    :class="layoutClasses"
  >
    <div
      v-if="showOriginalPane"
      class="pdf-viewer-layout__pane pdf-viewer-layout__pane--original"
      ref="originalPaneRef"
      tabindex="-1"
      @click="focusPane"
    >
      <slot name="original" />
    </div>

    <div
      v-if="showTranslatedPane"
      class="pdf-viewer-layout__pane pdf-viewer-layout__pane--translated"
      ref="translatedPaneRef"
    >
      <slot name="translated" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { usePdfScrollSync } from '../composables/usePdfScrollSync.js'
import './PdfViewerLayout.scss'

const props = defineProps({
  viewerMode: {
    type: String,
    default: 'bilingual'
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
  'pdf-viewer-layout--original': props.viewerMode === 'original',
  'pdf-viewer-layout--bilingual': props.viewerMode === 'bilingual',
  'pdf-viewer-layout--translated': props.viewerMode === 'translated',
  'pdf-viewer-layout--translated-pdf': props.viewerMode === 'translated-pdf'
}))

usePdfScrollSync(
  originalPaneRef,
  translatedPaneRef,
  computed(() => props.viewerMode === 'bilingual' && props.showOriginalPane && props.showTranslatedPane)
)

defineExpose({
  scrollContainer: originalPaneRef
})
</script>


