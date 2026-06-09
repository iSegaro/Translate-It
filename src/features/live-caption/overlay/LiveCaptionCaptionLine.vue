<template>
  <article
    class="live-caption-caption-line"
    :data-final="props.line?.isFinal !== false"
  >
    <div
      v-if="props.line?.segmentStartMs != null || props.line?.segmentEndMs != null"
      class="live-caption-caption-line__time"
    >
      {{ formatTimeRange(props.line) }}
    </div>
    <div class="live-caption-caption-line__original">
      {{ props.line?.originalText || '' }}
    </div>
    <div class="live-caption-caption-line__translated">
      {{ props.line?.translatedText || '' }}
    </div>
  </article>
</template>

<script setup>
const props = defineProps({
  line: {
    type: Object,
    default: () => ({})
  }
});

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

.live-caption-caption-line__original {
  font-size: 13px;
  line-height: 1.45;
}

.live-caption-caption-line__translated {
  font-size: 14px;
  line-height: 1.5;
  font-weight: 600;
}
</style>
