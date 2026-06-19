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
import {
  selectFinalizedCaptionLines,
  selectProjectedCaptionLines
} from './LiveCaptionCaptionTrackProjection.js';

const ENABLE_LIVE_CAPTION_PROJECTED_TIMELINE_RENDERING = false;

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
  timelineProjectionContext: {
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

const finalizedLines = computed(() => {
  if (ENABLE_LIVE_CAPTION_PROJECTED_TIMELINE_RENDERING) {
    const projectedLines = selectProjectedCaptionLines(props.captionLines, {
      enableProjectedTimelineRendering: ENABLE_LIVE_CAPTION_PROJECTED_TIMELINE_RENDERING,
      videoElement: props.videoElement,
      currentTimeMs: videoCurrentTimeMs.value,
      mediaTimelineMappingStatus: props.mediaTimelineMappingStatus,
      maxVisibleCaptionSegments: MAX_VISIBLE_CAPTION_SEGMENTS,
      timelineProjectionContext: props.timelineProjectionContext
    });

    if (projectedLines.length > 0) {
      return projectedLines;
    }
  }

  return selectFinalizedCaptionLines(props.captionLines, {
    currentTimeMs: videoCurrentTimeMs.value,
    mediaTimelineMappingStatus: props.mediaTimelineMappingStatus,
    maxVisibleCaptionSegments: MAX_VISIBLE_CAPTION_SEGMENTS
  });
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
