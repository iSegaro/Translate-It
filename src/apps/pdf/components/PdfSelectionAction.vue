<template>
  <div
    v-if="isSelected && !translatedText && !translationError"
    class="pdf-selection-action"
    :style="actionStyle"
  >
    <button
      class="pdf-selection-action__button"
      type="button"
      :disabled="isTranslating"
      @click.stop="$emit('translate')"
    >
      <span
        v-if="isTranslating"
        class="pdf-selection-action__spinner"
      />
      <svg
        v-else
        class="pdf-selection-action__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
      </svg>
    </button>
  </div>

  <div
    v-if="translatedText || translationError"
    class="pdf-selection-result"
    :style="resultStyle"
  >
    <div
      v-if="translatedText"
      class="pdf-selection-result__text"
    >
      {{ translatedText }}
    </div>
    <div
      v-if="translationError"
      class="pdf-selection-result__error"
    >
      {{ translationError }}
    </div>
    <button
      class="pdf-selection-result__close"
      type="button"
      @click.stop="$emit('dismiss')"
    >
      ×
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  isSelected: { type: Boolean, default: false },
  selectionPosition: { type: Object, default: null },
  isTranslating: { type: Boolean, default: false },
  translatedText: { type: String, default: '' },
  translationError: { type: String, default: '' }
})

defineEmits(['translate', 'dismiss'])

const actionStyle = computed(() => {
  if (!props.selectionPosition) return {}
  return {
    left: `${props.selectionPosition.x + props.selectionPosition.width / 2}px`,
    top: `${props.selectionPosition.y}px`
  }
})

const resultStyle = computed(() => {
  if (!props.selectionPosition) return {}
  return {
    left: `${props.selectionPosition.x}px`,
    top: `${props.selectionPosition.y + 40}px`,
    maxWidth: `${Math.max(250, props.selectionPosition.width)}px`
  }
})
</script>

<style scoped lang="scss">
.pdf-selection-action {
  position: fixed;
  z-index: 10000;
  transform: translateX(-50%);
}

.pdf-selection-action__button {
  appearance: none;
  border: 0;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #5a5cff;
  color: white;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: background 0.15s ease;

  &:hover {
    background: #4a4aee;
  }

  &:disabled {
    opacity: 0.7;
    cursor: progress;
  }
}

.pdf-selection-action__icon {
  width: 18px;
  height: 18px;
}

.pdf-selection-action__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.pdf-selection-result {
  position: fixed;
  z-index: 10000;
  background: #1a1d26;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  color: #e6edf7;
  font-size: 14px;
  line-height: 1.5;
}

.pdf-selection-result__text {
  white-space: pre-wrap;
  word-break: break-word;
}

.pdf-selection-result__error {
  color: #fecaca;
  font-size: 13px;
}

.pdf-selection-result__close {
  position: absolute;
  top: 4px;
  right: 8px;
  appearance: none;
  border: 0;
  background: transparent;
  color: rgba(230, 237, 247, 0.5);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;

  &:hover {
    color: #e6edf7;
  }
}
</style>
