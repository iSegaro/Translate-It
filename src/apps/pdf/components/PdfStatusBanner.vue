<template>
  <section
    class="pdf-status-banner"
    :class="{ 'pdf-status-banner--expanded': Boolean(body) }"
    role="status"
    aria-live="polite"
  >
    <button
      v-if="dismissible"
      class="pdf-status-banner__dismiss"
      type="button"
      aria-label="Dismiss status banner"
      title="Dismiss"
      @click="emit('dismiss')"
    >
      <span aria-hidden="true">×</span>
    </button>
    <div
      v-if="body"
      class="pdf-status-banner__body"
    >
      <slot
        name="body"
        :body="body"
      />
    </div>
  </section>
</template>

<script setup>
import './PdfStatusBanner.scss'

const emit = defineEmits(['dismiss'])

defineProps({
  body: {
    type: Object,
    default: null
  },
  dismissible: {
    type: Boolean,
    default: false
  }
})
</script>
