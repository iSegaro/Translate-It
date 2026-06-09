<template>
  <article
    class="live-caption-caption-line"
    :data-final="props.line?.isFinal !== false"
    :data-display-mode="resolvedDisplay.mode"
  >
    <div
      v-if="props.line?.segmentStartMs != null || props.line?.segmentEndMs != null"
      class="live-caption-caption-line__time"
    >
      {{ formatTimeRange(props.line) }}
    </div>
    <div
      v-for="row in resolvedDisplay.rows"
      :key="row.key"
      :class="[
        'live-caption-caption-line__text',
        `live-caption-caption-line__text--${row.kind}`
      ]"
      :data-kind="row.kind"
    >
      {{ row.text }}
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import {
  LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT,
  resolveLiveCaptionCaptionLineDisplay
} from '../core/LiveCaptionCaptionDisplayMode.js';

const props = defineProps({
  line: {
    type: Object,
    default: () => ({})
  },
  captionDisplayMode: {
    type: String,
    default: LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT
  }
});

const resolvedDisplay = computed(() => resolveLiveCaptionCaptionLineDisplay(props.line, props.captionDisplayMode));

function formatTimeRange(line) {
  const start = Number.isFinite(line?.segmentStartMs) ? `${Math.round(line.segmentStartMs / 1000)}s` : null;
  const end = Number.isFinite(line?.segmentEndMs) ? `${Math.round(line.segmentEndMs / 1000)}s` : null;

  if (start && end) {
    return `${start} - ${end}`;
  }

  return start || end || '';
}
</script>

<style scoped>
.live-caption-caption-line {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(9, 12, 18, 0.72);
  color: #f7f9fc;
}

.live-caption-caption-line__time {
  font-size: 11px;
  letter-spacing: 0.02em;
  opacity: 0.72;
}

.live-caption-caption-line__text {
  font-size: 13px;
  line-height: 1.45;
}

.live-caption-caption-line__text--translated {
  font-size: 14px;
  line-height: 1.5;
  font-weight: 600;
}

.live-caption-caption-line__text--original {
  opacity: 0.92;
}
</style>
