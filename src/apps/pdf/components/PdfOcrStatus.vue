<template>
  <div
    v-if="showIndicator"
    class="pdf-ocr-status"
    :class="statusClasses"
  >
    <span class="pdf-ocr-status__icon">{{ statusIcon }}</span>
    <span class="pdf-ocr-status__text">{{ statusText }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  isScannedCandidate: { type: Boolean, default: false },
  isOcrComplete: { type: Boolean, default: false },
  ocrError: { type: String, default: '' }
})

const showIndicator = computed(() => props.isScannedCandidate || props.isOcrComplete || props.ocrError)

const statusClasses = computed(() => ({
  'pdf-ocr-status--scanned': props.isScannedCandidate && !props.isOcrComplete,
  'pdf-ocr-status--complete': props.isOcrComplete,
  'pdf-ocr-status--error': !!props.ocrError
}))

const statusIcon = computed(() => {
  if (props.ocrError) return '!'
  if (props.isOcrComplete) return '✓'
  return '📷'
})

const statusText = computed(() => {
  if (props.ocrError) return `OCR failed: ${props.ocrError}`
  if (props.isOcrComplete) return 'OCR complete'
  return 'Scanned page — OCR available'
})
</script>

<style scoped lang="scss">
.pdf-ocr-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;

  &--scanned {
    background: rgba(244, 184, 96, 0.12);
    color: #f4b860;
  }

  &--complete {
    background: rgba(34, 197, 94, 0.12);
    color: #22c55e;
  }

  &--error {
    background: rgba(239, 68, 68, 0.12);
    color: #fecaca;
  }
}

.pdf-ocr-status__icon {
  font-size: 11px;
}

.pdf-ocr-status__text {
  white-space: nowrap;
}
</style>
