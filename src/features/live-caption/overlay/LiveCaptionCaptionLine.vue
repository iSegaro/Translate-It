<template>
  <article
    class="live-caption-caption-line"
    :data-final="props.line?.isFinal !== false"
    :data-display-mode="resolvedDisplay.mode"
  >
    <div
      v-if="props.line?.segmentStartMs != null || props.line?.segmentEndMs != null || props.line?.startMs != null || props.line?.endMs != null"
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
  const startMs = line?.segmentStartMs ?? line?.startMs;
  const endMs = line?.segmentEndMs ?? line?.endMs;
  const start = Number.isFinite(startMs) ? `${Math.round(startMs / 1000)}s` : null;
  const end = Number.isFinite(endMs) ? `${Math.round(endMs / 1000)}s` : null;

  if (start && end) {
    return `${start} - ${end}`;
  }

  return start || end || '';
}
</script>
