<template>
  <div
    class="pdf-translated-block"
    :class="blockClasses"
    :dir="textDirection"
  >
    <div
      v-if="status === 'loading'"
      class="pdf-translated-block__loading"
    >
      <span class="pdf-translated-block__spinner" />
      <span>Translating...</span>
    </div>

    <div
      v-else-if="status === 'error'"
      class="pdf-translated-block__error"
    >
      {{ translationState.error || 'Translation failed' }}
    </div>

    <div
      v-else-if="status === 'translated'"
      class="pdf-translated-block__text"
    >
      {{ translatedText }}
    </div>

    <div
      v-else
      class="pdf-translated-block__text pdf-translated-block__text--idle"
    >
      {{ block.text }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  block: {
    type: Object,
    required: true
  },
  translationState: {
    type: Object,
    default: () => ({
      status: 'idle',
      translatedText: '',
      error: null
    })
  },
  highlighted: {
    type: Boolean,
    default: false
  }
})

const status = computed(() => props.translationState.status || 'idle')

const translatedText = computed(() => props.translationState.translatedText || '')

const textDirection = computed(() => {
  if (status.value !== 'translated') return undefined

  const text = translatedText.value
  if (!text) return undefined

  const rtlChars = text.match(/[\u0591-\u05FF\u0600-\u06FF\u0700-\u074F]/g)
  const ltrChars = text.match(/[a-zA-Z\u00C0-\u024F]/g)

  const rtlCount = rtlChars?.length || 0
  const ltrCount = ltrChars?.length || 0

  return rtlCount > ltrCount ? 'rtl' : 'ltr'
})

const blockClasses = computed(() => ({
  'pdf-translated-block--loading': status.value === 'loading',
  'pdf-translated-block--error': status.value === 'error',
  'pdf-translated-block--translated': status.value === 'translated',
  'pdf-translated-block--idle': status.value === 'idle',
  'pdf-translated-block--highlighted': props.highlighted,
  [`pdf-translated-block--${props.block.role}`]: !!props.block.role
}))
</script>

<style scoped lang="scss">
.pdf-translated-block {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid transparent;
  transition: background 0.2s ease, border-color 0.2s ease;

  &--loading {
    border-left-color: rgba(90, 92, 255, 0.6);
    background: rgba(90, 92, 255, 0.06);
  }

  &--error {
    border-left-color: rgba(239, 68, 68, 0.7);
    background: rgba(239, 68, 68, 0.06);
  }

  &--translated {
    border-left-color: rgba(34, 197, 94, 0.6);
  }

  &--highlighted {
    outline: 2px solid rgba(90, 92, 255, 0.7);
    outline-offset: 2px;
    background: rgba(90, 92, 255, 0.08);
  }

  &--heading {
    font-weight: 700;
    font-size: 1.1em;
  }

  &--caption {
    font-style: italic;
    font-size: 0.9em;
    color: rgba(230, 237, 247, 0.7);
  }

  &--list-item {
    padding-left: 24px;
  }
}

.pdf-translated-block__text {
  line-height: 1.6;
  word-break: break-word;

  &--idle {
    color: rgba(230, 237, 247, 0.5);
    font-style: italic;
  }
}

.pdf-translated-block__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(230, 237, 247, 0.6);
  font-size: 13px;
}

.pdf-translated-block__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(90, 92, 255, 0.2);
  border-top-color: rgba(90, 92, 255, 0.8);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.pdf-translated-block__error {
  color: #fecaca;
  font-size: 13px;
}
</style>
