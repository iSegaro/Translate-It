<template>
  <div class="pdf-load-failure-banner">
    <span
      class="pdf-load-failure-banner__icon"
      :class="`pdf-load-failure-banner__icon--${icon}`"
      aria-hidden="true"
    />
    <div class="pdf-load-failure-banner__content">
      <p class="pdf-load-failure-banner__title">{{ title }}</p>
      <p class="pdf-load-failure-banner__description">{{ description }}</p>
      <button
        v-if="retryable"
        class="pdf-load-failure-banner__retry"
        type="button"
        :disabled="isLoading"
        @click="emit('retry')"
      >
        Retry
      </button>
    </div>
  </div>
</template>

<script setup>
const emit = defineEmits(['retry'])

defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  severity: { type: String, required: true },
  retryable: { type: Boolean, required: true },
  icon: { type: String, required: true },
  isLoading: { type: Boolean, default: false },
})
</script>

<style scoped lang="scss">
.pdf-load-failure-banner {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  max-width: 480px;
  margin: 0 auto;
  padding: 24px;
}

.pdf-load-failure-banner__icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pdf-load-failure-banner__icon--offline {
  background: #95a5a6;
}

.pdf-load-failure-banner__icon--warning {
  background: #f4b860;
}

.pdf-load-failure-banner__icon--error {
  background: #e74c3c;
}

.pdf-load-failure-banner__content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pdf-load-failure-banner__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: rgb(230, 237, 247);
}

.pdf-load-failure-banner__description {
  margin: 0;
  font-size: 13px;
  color: rgba(230, 237, 247, 0.7);
  line-height: 1.4;
}

.pdf-load-failure-banner__retry {
  align-self: flex-start;
  margin-top: 10px;
  padding: 6px 16px;
  border: 1px solid rgba(230, 237, 247, 0.25);
  border-radius: 6px;
  background: transparent;
  color: rgb(230, 237, 247);
  font-size: 13px;
  cursor: pointer;
}

.pdf-load-failure-banner__retry:hover {
  background: rgba(230, 237, 247, 0.08);
}
</style>
