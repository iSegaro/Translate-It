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
        {{ resolvedTitle }}
      </h2>
      <p class="live-caption-consent-notice__message">
        {{ resolvedNotice.message }}
      </p>
      <ul
        v-if="resolvedNotice.details?.length"
        class="live-caption-consent-notice__details"
      >
        <li
          v-for="detail in resolvedNotice.details"
          :key="detail"
          class="live-caption-consent-notice__detail"
        >
          {{ detail }}
        </li>
      </ul>
      <div class="live-caption-consent-notice__actions">
        <button
          type="button"
          class="live-caption-consent-notice__button live-caption-consent-notice__button--primary"
          @click="$emit('accept')"
        >
          {{ resolvedAcceptLabel }}
        </button>
        <button
          type="button"
          class="live-caption-consent-notice__button"
          @click="$emit('cancel')"
        >
          {{ resolvedCancelLabel }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { createLiveCaptionPrivacyNotice } from '../core/LiveCaptionConsentPolicy.js';

const props = defineProps({
  visible: {
    type: Boolean,
    default: true
  },
  notice: {
    type: Object,
    default: null
  },
  isIncognito: {
    type: Boolean,
    default: false
  },
  browserName: {
    type: String,
    default: 'unknown'
  },
  platform: {
    type: String,
    default: 'desktop'
  },
  acceptLabel: {
    type: String,
    default: null
  },
  cancelLabel: {
    type: String,
    default: null
  }
});

const resolvedNotice = computed(() => props.notice || createLiveCaptionPrivacyNotice({
  isIncognito: props.isIncognito,
  browserName: props.browserName,
  platform: props.platform
}));

const resolvedTitle = computed(() => resolvedNotice.value.title || 'Live Caption consent');
const resolvedAcceptLabel = computed(() => props.acceptLabel || resolvedNotice.value.acceptLabel || 'Allow');
const resolvedCancelLabel = computed(() => props.cancelLabel || resolvedNotice.value.cancelLabel || 'Cancel');

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

.live-caption-consent-notice__details {
  margin: 12px 0 0;
  padding: 0 0 0 18px;
  font-size: 12px;
  line-height: 1.45;
  opacity: 0.86;
}

.live-caption-consent-notice__detail + .live-caption-consent-notice__detail {
  margin-top: 6px;
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
