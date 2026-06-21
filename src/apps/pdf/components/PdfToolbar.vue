<template>
  <header class="pdf-toolbar">
    <div class="pdf-toolbar__title-block">
      <p class="pdf-toolbar__eyebrow">
        Translate It
      </p>
      <h1>PDF Viewer</h1>
      <p class="pdf-toolbar__subtitle">
        Dedicated viewer only. Load a PDF manually to inspect visible pages.
      </p>

      <div
        v-if="fileName"
        class="pdf-toolbar__meta"
      >
        <span>{{ fileName }}</span>
        <span>{{ pageCount }} pages</span>
        <span>Worker: {{ workerLabel }}</span>
      </div>
    </div>

    <div class="pdf-toolbar__actions">
      <button
        class="pdf-toolbar__button"
        type="button"
        :disabled="isLoading"
        @click="openFilePicker"
      >
        {{ isLoading ? 'Loading...' : 'Open PDF' }}
      </button>
      <input
        ref="fileInput"
        class="pdf-toolbar__file-input"
        type="file"
        accept="application/pdf,.pdf"
        @change="handleFileInputChange"
      >
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  fileName: { type: String, default: '' },
  pageCount: { type: Number, default: 0 },
  workerLabel: { type: String, default: '' },
  isLoading: { type: Boolean, default: false }
})

const emit = defineEmits(['file-selected'])
const fileInput = ref(null)

function openFilePicker() {
  fileInput.value?.click()
}

function handleFileInputChange(event) {
  const [file] = event.target.files || []
  if (file) {
    emit('file-selected', file)
  }
  event.target.value = ''
}
</script>

<style scoped lang="scss">
.pdf-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding: 24px 28px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.pdf-toolbar__eyebrow,
.pdf-toolbar__subtitle {
  margin: 0;
  color: rgba(230, 237, 247, 0.72);
}

.pdf-toolbar__title-block h1 {
  margin: 4px 0 8px;
  font-size: 28px;
  line-height: 1.1;
}

.pdf-toolbar__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  color: rgba(230, 237, 247, 0.66);
  font-size: 13px;
}

.pdf-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pdf-toolbar__button {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 10px 18px;
  background: #f4b860;
  color: #11161d;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.7;
    cursor: progress;
  }
}

.pdf-toolbar__file-input {
  display: none;
}
</style>
