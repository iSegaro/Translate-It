<template>
  <section
    class="live-caption-caption-track"
    aria-live="polite"
    aria-relevant="additions text"
  >
    <LiveCaptionCaptionLine
      v-for="line in finalizedLines"
      :key="lineKey(line)"
      :line="line"
      :caption-display-mode="captionDisplayMode"
    />
  </section>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT } from '../core/LiveCaptionCaptionDisplayMode.js';
import LiveCaptionCaptionLine from './LiveCaptionCaptionLine.vue';

const props = defineProps({
  captionLines: {
    type: Array,
    default: () => []
  },
  captionDisplayMode: {
    type: String,
    default: LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT
  },
  videoElement: {
    type: Object,
    default: null
  },
  mediaTimelineMappingStatus: {
    type: String,
    default: 'invalid'
  }
});

const MAX_VISIBLE_CAPTION_SEGMENTS = 2;

// Track video time reactively in ms
const videoCurrentTimeMs = ref(0);

const updateTime = () => {
  if (props.videoElement) {
    videoCurrentTimeMs.value = props.videoElement.currentTime * 1000;
  }
};

watch(
  () => props.videoElement,
  (newVideo, oldVideo) => {
    if (oldVideo) {
      oldVideo.removeEventListener('timeupdate', updateTime);
    }
    if (newVideo) {
      newVideo.addEventListener('timeupdate', updateTime);
      updateTime();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (props.videoElement) {
    props.videoElement.removeEventListener('timeupdate', updateTime);
  }
});

function toFiniteNumberOrNull(val) {
  if (val == null || val === '') {
    return null;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

const finalizedLines = computed(() => {
  if (!Array.isArray(props.captionLines)) return [];
  const lines = props.captionLines.filter((line) => {
    if (line?.isFinal === false) {
      return false;
    }
    const text = line?.translatedText || line?.originalText || '';
    return text.trim().length > 0;
  });

  // TODO: `"valid"` currently means “single-anchor continuous playback” (conservative single-anchor policy).
  // Later anchor-list mapping can support pause/seek and replace this boolean/status without changing overlay API much.
  if (props.mediaTimelineMappingStatus === 'valid') {
    const currentTimeMs = videoCurrentTimeMs.value;
    const filtered = lines.filter((line) => {
      const mediaStartMs = toFiniteNumberOrNull(line.mediaStartMs);
      const mediaEndMs = toFiniteNumberOrNull(line.mediaEndMs);

      // Fallback safely if media timestamps are missing or non-finite for this caption
      if (mediaStartMs == null || mediaEndMs == null) {
        return true;
      }

      return (
        currentTimeMs >= mediaStartMs &&
        currentTimeMs <= Math.max(mediaEndMs + 1500, mediaStartMs + 2000)
      );
    });
    return filtered.slice(-MAX_VISIBLE_CAPTION_SEGMENTS);
  }

  // Fallback to old behavior: last 2 finalized captions
  return lines.slice(-MAX_VISIBLE_CAPTION_SEGMENTS);
});

function lineKey(line) {
  return [
    line?.sessionId || 'session',
    line?.videoFingerprint || 'video',
    line?.segmentStartMs ?? line?.startMs ?? 'start',
    line?.segmentEndMs ?? line?.endMs ?? 'end',
    line?.translatedText || line?.originalText || ''
  ].join(':');
}
</script>
