<template>
  <section
    ref="overlayElement"
    v-show="shouldShowOverlay"
    class="live-caption-overlay"
    :class="[
      `live-caption-overlay--${status || 'idle'}`,
      `live-caption-overlay--runtime-${runtimeStatus || 'idle'}`
    ]"
    :style="resolvedPositionStyle"
    :data-status="status || 'idle'"
    :data-runtime-status="runtimeStatus || 'idle'"
    :data-active-session-state="activeSessionState || 'idle'"
    :data-active-video-fingerprint="activeVideoState?.videoFingerprint || 'none'"
    role="region"
    aria-label="Live Caption overlay"
  >
    <div class="live-caption-overlay__panel">
      <LiveCaptionCaptionTrack
        :caption-lines="captionLines"
        :caption-display-mode="captionDisplayMode"
        :video-element="videoElement"
        :media-timeline-mapping-status="mediaTimelineMappingStatus"
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
        @pause="$emit('pause')"
        @resume="$emit('resume')"
        @retry="$emit('retry')"
        @clear-cache="$emit('clear-cache')"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT } from '../core/LiveCaptionCaptionDisplayMode.js';
import LiveCaptionCaptionTrack from './LiveCaptionCaptionTrack.vue';
import LiveCaptionControls from './LiveCaptionControls.vue';
import { useLiveCaptionOverlay } from './useLiveCaptionOverlay.js';
import { liveCaptionUiStyles } from '@/core/content-scripts/chunks/lazy-styles.js';
import { injectStylesToShadowRoot } from '@/utils/ui/styleInjector.js';

onMounted(() => {
  if (liveCaptionUiStyles && injectStylesToShadowRoot) {
    injectStylesToShadowRoot(liveCaptionUiStyles, 'vue-live-caption-styles');
  }
});

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
  runtimeStatus: {
    type: String,
    default: 'idle'
  },
  activeSessionState: {
    type: String,
    default: 'idle'
  },
  captionLines: {
    type: Array,
    default: () => []
  },
  captionDisplayMode: {
    type: String,
    default: LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT
  },
  browserName: {
    type: String,
    default: 'unknown'
  },
  platform: {
    type: String,
    default: 'desktop'
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
  mediaTimelineMappingStatus: {
    type: String,
    default: 'invalid'
  },
  activeVideoState: {
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

defineEmits(['start', 'stop', 'pause', 'resume', 'retry', 'clear-cache']);

const overlayAnchor = useLiveCaptionOverlay(
  () => props.videoElement,
  {
    offsetBottom: props.offsetBottom,
    offsetHorizontal: props.offsetHorizontal
  }
);

const overlayElement = overlayAnchor.overlayElement;

const resolvedPositionStyle = computed(() => props.positionStyle || overlayAnchor.overlayStyle.value || null);
const shouldShowOverlay = computed(() => {
  if (!props.visible) return false;
  if (!props.videoElement) return true;
  return overlayAnchor.isVisible.value;
});

logger.debug('Live-caption overlay shell initialized');
</script>
