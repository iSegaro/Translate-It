<template>
  <div
    class="pdf-viewer-layout"
    :class="layoutClasses"
  >
    <div
      v-if="showOriginalPane"
      class="pdf-viewer-layout__pane pdf-viewer-layout__pane--original"
    >
      <slot name="original" />
    </div>

    <div
      v-if="showTranslatedPane"
      class="pdf-viewer-layout__pane pdf-viewer-layout__pane--translated"
    >
      <slot name="translated" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

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

const layoutClasses = computed(() => ({
  'pdf-viewer-layout--original': props.viewerMode === 'original',
  'pdf-viewer-layout--bilingual': props.viewerMode === 'bilingual',
  'pdf-viewer-layout--translated': props.viewerMode === 'translated',
  'pdf-viewer-layout--translated-pdf': props.viewerMode === 'translated-pdf'
}))
</script>

<style scoped lang="scss">
.pdf-viewer-layout {
  display: grid;
  gap: 24px;
  width: 100%;
  min-height: 0;

  &--original,
  &--translated,
  &--translated-pdf {
    grid-template-columns: 1fr;
  }

  &--bilingual {
    grid-template-columns: 1fr 1fr;

    @media (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  }
}

.pdf-viewer-layout__pane {
  min-width: 0;
  overflow-y: auto;
  max-height: calc(100vh - 120px);
}
</style>
