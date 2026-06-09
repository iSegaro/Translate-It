<template>
  <section
    v-if="visible"
    class="live-caption-consent-notice"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="live-caption-consent-title"
  >
    <div class="live-caption-consent-notice__body">
      <h2
        id="live-caption-consent-title"
        class="live-caption-consent-notice__title"
      >
        {{ title }}
      </h2>
      <p class="live-caption-consent-notice__message">
        {{ message }}
      </p>
      <div class="live-caption-consent-notice__actions">
        <button
          type="button"
          class="live-caption-consent-notice__button live-caption-consent-notice__button--primary"
          @click="$emit('accept')"
        >
          {{ acceptLabel }}
        </button>
        <button
          type="button"
          class="live-caption-consent-notice__button"
          @click="$emit('cancel')"
        >
          {{ cancelLabel }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: true
  },
  title: {
    type: String,
    default: 'Live Caption'
  },
  message: {
    type: String,
    default: 'Captions require capturing tab audio. Confirm before continuing.'
  },
  acceptLabel: {
    type: String,
    default: 'Allow'
  },
  cancelLabel: {
    type: String,
    default: 'Cancel'
  }
});

defineEmits(['accept', 'cancel']);
</script>

<style scoped>
.live-caption-consent-notice {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: auto;
  background: rgba(10, 12, 20, 0.72);
  color: #f5f7fb;
  z-index: 2;
}

.live-caption-consent-notice__body {
  width: min(92vw, 420px);
  padding: 16px 18px;
  border-radius: 16px;
  background: rgba(18, 22, 34, 0.96);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.live-caption-consent-notice__title {
  margin: 0 0 8px;
  font-size: 16px;
  line-height: 1.2;
}

.live-caption-consent-notice__message {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.92;
}

.live-caption-consent-notice__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

.live-caption-consent-notice__button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;
}

.live-caption-consent-notice__button--primary {
  background: #ffffff;
  color: #121826;
}
</style>
