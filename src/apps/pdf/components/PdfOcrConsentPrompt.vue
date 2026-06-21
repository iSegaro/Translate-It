<template>
  <div
    v-if="visible"
    class="pdf-ocr-consent"
  >
    <div class="pdf-ocr-consent__content">
      <p class="pdf-ocr-consent__message">
        {{ pageCount }} scanned page(s) detected. OCR can extract text from these pages.
      </p>
      <p class="pdf-ocr-consent__detail">
        OCR runs locally in your browser. No images are sent externally.
      </p>
      <div class="pdf-ocr-consent__actions">
        <button
          class="pdf-ocr-consent__button pdf-ocr-consent__button--confirm"
          type="button"
          @click="$emit('confirm')"
        >
          Run OCR
        </button>
        <button
          class="pdf-ocr-consent__button pdf-ocr-consent__button--cancel"
          type="button"
          @click="$emit('cancel')"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  pageCount: { type: Number, default: 0 }
})

defineEmits(['confirm', 'cancel'])
</script>

<style scoped lang="scss">
.pdf-ocr-consent {
  padding: 16px;
  border-radius: 12px;
  background: rgba(90, 92, 255, 0.08);
  border: 1px solid rgba(90, 92, 255, 0.2);
}

.pdf-ocr-consent__message {
  margin: 0 0 8px;
  font-weight: 600;
}

.pdf-ocr-consent__detail {
  margin: 0 0 16px;
  color: rgba(230, 237, 247, 0.7);
  font-size: 13px;
}

.pdf-ocr-consent__actions {
  display: flex;
  gap: 12px;
}

.pdf-ocr-consent__button {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 600;
  cursor: pointer;

  &--confirm {
    background: rgba(90, 92, 255, 0.3);
    color: #e6edf7;

    &:hover {
      background: rgba(90, 92, 255, 0.45);
    }
  }

  &--cancel {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(230, 237, 247, 0.7);

    &:hover {
      background: rgba(255, 255, 255, 0.14);
    }
  }
}
</style>
