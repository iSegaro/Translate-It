<template>
  <section
    v-if="visible"
    class="pdf-status-banner"
    :class="bannerClasses"
    :role="variant === 'error' ? 'alert' : 'status'"
    aria-live="polite"
  >
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
  }
})

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

<style scoped lang="scss">
.pdf-status-banner {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: start;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #e6edf7;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
  margin-bottom: 0;
}

.pdf-status-banner__icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 15px;
  line-height: 1;
  color: #0b0e13;
  background: rgba(230, 237, 247, 0.88);
}

.pdf-status-banner__content {
  min-width: 0;
}

.pdf-status-banner__title,
.pdf-status-banner__message,
.pdf-status-banner__detail {
  margin: 0;
}

.pdf-status-banner__title {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.pdf-status-banner__message {
  margin-top: 4px;
  font-size: 13px;
  color: rgba(230, 237, 247, 0.84);
}

.pdf-status-banner__detail {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(230, 237, 247, 0.66);
}

.pdf-status-banner--success {
  border-color: rgba(45, 212, 191, 0.18);
  background: rgba(45, 212, 191, 0.08);
}

.pdf-status-banner--warning {
  border-color: rgba(245, 158, 11, 0.18);
  background: rgba(245, 158, 11, 0.08);
}

.pdf-status-banner--error {
  border-color: rgba(248, 113, 113, 0.22);
  background: rgba(248, 113, 113, 0.1);
}
</style>
