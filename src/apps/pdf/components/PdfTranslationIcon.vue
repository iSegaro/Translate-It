<template>
  <button
    class="pdf-translation-icon"
    type="button"
    :title="title"
    :aria-label="ariaLabel"
    data-testid="pdf-translation-icon"
    @click.stop="emit('click')"
    @pointerdown.stop
  >
    <svg
      class="pdf-translation-icon__svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M4 4h7v2H8.4l2.8 2.8-1.4 1.4L7 7.4V11H5V7.4L2.2 10.2.8 8.8 3.6 6H2V4h2zm10 0h8v2h-3v2h2v2h-2v6h-2v-2h-3.2l-.8 2H11l3-10h2l-1 4H17V6h-3V4zm1.6 7 1.2-4h-1l-1.1 4h.9zM6 14h2v2h2v2H8v2H6v-2H4v-2h2v-2zm8 2h8v2h-8v-2zm0 4h6v2h-6v-2z"
      />
    </svg>
  </button>
</template>

<script setup>
import './PdfTranslationIcon.scss'

defineProps({
  title: {
    type: String,
    default: ''
  },
  ariaLabel: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['click'])
</script>
