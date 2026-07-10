<template>
  <section
    v-if="visible"
    class="pdf-status-banner"
    :class="bannerClasses"
    :role="variant === 'error' ? 'alert' : 'status'"
    aria-live="polite"
  >
    <button
      v-if="dismissible"
      class="pdf-status-banner__dismiss"
      type="button"
      aria-label="Dismiss status banner"
      title="Dismiss"
      @click="$emit('dismiss')"
    >
      <span aria-hidden="true">×</span>
    </button>
    <div
      class="pdf-status-banner__icon"
      aria-hidden="true"
    >
      {{ iconLabel }}
    </div>
    <div class="pdf-status-banner__content">
      <p class="pdf-status-banner__title">
        {{ title }}
      </p>
      <p class="pdf-status-banner__message">
        {{ message }}
      </p>
      <p
        v-if="detail"
        class="pdf-status-banner__detail"
      >
        {{ detail }}
      </p>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import './PdfStatusBanner.scss'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  variant: {
    type: String,
    default: 'info'
  },
  title: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  detail: {
    type: String,
    default: ''
  },
  dismissible: {
    type: Boolean,
    default: false
  }
})

defineEmits(['dismiss'])

const iconLabels = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '!'
}

const iconLabel = computed(() => iconLabels[props.variant] || 'i')

const bannerClasses = computed(() => ({
  'pdf-status-banner--info': props.variant === 'info',
  'pdf-status-banner--success': props.variant === 'success',
  'pdf-status-banner--warning': props.variant === 'warning',
  'pdf-status-banner--error': props.variant === 'error'
}))
</script>
