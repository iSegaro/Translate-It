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

const finalizedLines = computed(() => (Array.isArray(props.captionLines)
  ? props.captionLines.filter((line) => {
      if (line?.isFinal === false) {
        return false;
      }
      const text = line?.translatedText || line?.originalText || '';
      return text.trim().length > 0;
    })
  : []));

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

<style scoped>
.live-caption-caption-track {
  display: grid;
  gap: 8px;
  pointer-events: auto;
}
</style>
