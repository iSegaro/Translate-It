<template>
  <div
    v-if="processing"
    class="pdf-ocr-progress"
  >
    <div class="pdf-ocr-progress__bar">
      <div
        class="pdf-ocr-progress__fill"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>
    <div class="pdf-ocr-progress__info">
      <span>OCR: Processing page {{ progress.current }}/{{ progress.total }}</span>
      <button
        class="pdf-ocr-progress__cancel"
        type="button"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  processing: { type: Boolean, default: false },
  progress: {
    type: Object,
    default: () => ({ current: 0, total: 0, pageNumber: 0 })
  }
})

defineEmits(['cancel'])

const progressPercent = computed(() => {
  if (!props.progress.total) return 0
  return Math.round((props.progress.current / props.progress.total) * 100)
})
</script>

<style scoped lang="scss">
.pdf-ocr-progress {
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(90, 92, 255, 0.06);
  border: 1px solid rgba(90, 92, 255, 0.15);
}

.pdf-ocr-progress__bar {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
  margin-bottom: 8px;
}

.pdf-ocr-progress__fill {
  height: 100%;
  background: rgba(90, 92, 255, 0.6);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.pdf-ocr-progress__info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: rgba(230, 237, 247, 0.7);
}

.pdf-ocr-progress__cancel {
  appearance: none;
  border: 0;
  background: rgba(239, 68, 68, 0.15);
  color: #fecaca;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: rgba(239, 68, 68, 0.25);
  }
}
</style>
