<template>
  <section
    v-show="visible"
    class="live-caption-overlay"
    :class="[
      `live-caption-overlay--${status || 'idle'}`,
      { 'live-caption-overlay--blocked': showConsentPanel }
    ]"
    :style="resolvedPositionStyle"
    :data-status="status || 'idle'"
    role="region"
    aria-label="Live Caption overlay"
  >
    <div class="live-caption-overlay__panel">
      <LiveCaptionConsentNotice
        v-if="showConsentPanel"
        :visible="showConsentPanel"
        @accept="$emit('accept-consent')"
        @cancel="$emit('cancel-consent')"
      />

      <template v-else>
        <LiveCaptionCaptionTrack
          :caption-lines="captionLines"
        />

        <div
          v-if="lastError"
          class="live-caption-overlay__error"
          role="alert"
        >
          {{ lastError?.message || 'Live Caption error' }}
        </div>

        <LiveCaptionControls
          :controls-state="controlsState"
          @start="$emit('start')"
          @stop="$emit('stop')"
          @retry="$emit('retry')"
          @clear-cache="$emit('clear-cache')"
        />
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import LiveCaptionConsentNotice from './LiveCaptionConsentNotice.vue';
import LiveCaptionCaptionTrack from './LiveCaptionCaptionTrack.vue';
import LiveCaptionControls from './LiveCaptionControls.vue';
import { useLiveCaptionOverlay } from './useLiveCaptionOverlay.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'LiveCaptionOverlay');

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    default: 'idle'
  },
  captionLines: {
    type: Array,
    default: () => []
  },
  consentAccepted: {
    type: Boolean,
    default: false
  },
  showConsentNotice: {
    type: Boolean,
    default: false
  },
  lastError: {
    type: Object,
    default: null
  },
  controlsState: {
    type: Object,
    default: () => ({})
  },
  positionStyle: {
    type: Object,
    default: null
  },
  videoElement: {
    type: Object,
    default: null
  },
  offsetBottom: {
    type: Number,
    default: 16
  },
  offsetHorizontal: {
    type: Number,
    default: 16
  }
});

defineEmits(['accept-consent', 'cancel-consent', 'start', 'stop', 'retry', 'clear-cache']);

const overlayAnchor = useLiveCaptionOverlay(
  () => props.videoElement,
  {
    offsetBottom: props.offsetBottom,
    offsetHorizontal: props.offsetHorizontal
  }
);

const resolvedPositionStyle = computed(() => props.positionStyle || overlayAnchor.overlayStyle.value || null);
const showConsentPanel = computed(() => props.showConsentNotice || !props.consentAccepted);

logger.debug('Live-caption overlay shell initialized');
</script>

<style scoped>
.live-caption-overlay {
  position: fixed;
  inset: auto auto 16px 16px;
  width: min(92vw, 720px);
  pointer-events: none;
  z-index: 2147483647;
  display: grid;
}

.live-caption-overlay__panel {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  background: rgba(13, 16, 24, 0.78);
  backdrop-filter: blur(14px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  pointer-events: none;
}

.live-caption-overlay--blocked .live-caption-overlay__panel {
  min-height: 180px;
}

.live-caption-overlay__error {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(156, 21, 21, 0.24);
  color: #ffd9d9;
  pointer-events: auto;
}
</style>
