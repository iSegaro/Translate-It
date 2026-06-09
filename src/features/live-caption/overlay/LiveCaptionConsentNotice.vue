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
