<template>
  <section
    class="pdf-dropzone"
    :class="{
      'is-drag-over': isDragOver,
      'pdf-dropzone--document': hasDocument
    }"
    :role="hasDocument ? undefined : 'button'"
    :tabindex="hasDocument ? undefined : 0"
    :aria-label="hasDocument ? undefined : 'Open PDF'"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <slot
      v-if="!hasDocument"
      name="empty"
    />
    <slot
      v-else
      name="document"
    />
  </section>
</template>

<script setup>
const props = defineProps({
  hasDocument: { type: Boolean, default: false },
  isDragOver: { type: Boolean, default: false }
})

const emit = defineEmits(['file-selected', 'drag-state-change', 'request-open-pdf'])

function handleDragEnter() {
  emit('drag-state-change', true)
}

function handleDragOver() {
  emit('drag-state-change', true)
}

function handleDragLeave(event) {
  if (event.currentTarget === event.target) {
    emit('drag-state-change', false)
  }
}

function handleDrop(event) {
  emit('drag-state-change', false)
  const [file] = event.dataTransfer?.files || []
  if (file) {
    emit('file-selected', file)
  }
}

function handleClick() {
  if (!props.hasDocument) {
    emit('request-open-pdf')
  }
}
</script>

<style scoped lang="scss">
@use '../../../assets/styles/base/variables' as *;

.pdf-dropzone {
  flex: 1;
  min-height: calc(100vh - 140px);
  margin: 0 28px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 24px;
  background: rgba(12, 15, 22, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

.pdf-dropzone:not(.pdf-dropzone--document) {
  cursor: pointer;
}

.pdf-dropzone--document {
  min-height: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
  display: flex;
  flex-direction: column;
}

.pdf-dropzone.is-drag-over {
  border-color: #f4b860;
  box-shadow: 0 0 0 2px rgba(244, 184, 96, 0.18);
}

@media (max-width: 1100px) {
  .pdf-dropzone {
    margin: 0 $spacing-md;
  }

  .pdf-dropzone--document {
    margin: 0;
  }
}
</style>
