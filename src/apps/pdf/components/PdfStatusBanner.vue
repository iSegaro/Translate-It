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
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #e6edf7;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
  margin-bottom: 0;
  width: 100%;
  box-sizing: border-box;
}

.pdf-status-banner__icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 13px;
  line-height: 1;
  color: #0b0e13;
  background: rgba(230, 237, 247, 0.88);
}

.pdf-status-banner__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pdf-status-banner__title,
.pdf-status-banner__message,
.pdf-status-banner__detail {
  margin: 0;
}

.pdf-status-banner__title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.pdf-status-banner__message {
  margin-top: 0;
  font-size: 12px;
  color: rgba(230, 237, 247, 0.84);
}

.pdf-status-banner__detail {
  margin-top: 0;
  font-size: 11px;
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
