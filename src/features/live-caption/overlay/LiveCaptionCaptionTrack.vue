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
import { computed } from 'vue';
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
  }
});

const MAX_VISIBLE_CAPTION_SEGMENTS = 2;

const finalizedLines = computed(() => {
  if (!Array.isArray(props.captionLines)) return [];
  const lines = props.captionLines.filter((line) => {
    if (line?.isFinal === false) {
      return false;
    }
    const text = line?.translatedText || line?.originalText || '';
    return text.trim().length > 0;
  });
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
