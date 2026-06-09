<template>
  <nav
    class="live-caption-controls"
    aria-label="Live Caption controls"
  >
    <button
      type="button"
      class="live-caption-controls__button"
      :disabled="Boolean(controlsState?.canStart === false)"
      @click="$emit('start')"
    >
      Start
    </button>
    <button
      type="button"
      class="live-caption-controls__button"
      :disabled="Boolean(controlsState?.canStop === false)"
      @click="$emit('stop')"
    >
      Stop
    </button>
    <button
      type="button"
      class="live-caption-controls__button"
      :disabled="Boolean(controlsState?.canRetry === false)"
      @click="$emit('retry')"
    >
      Retry
    </button>
    <button
      type="button"
      class="live-caption-controls__button"
      :disabled="Boolean(controlsState?.canClearCache === false)"
      @click="$emit('clear-cache')"
    >
      Clear Cache
    </button>
  </nav>
</template>

<script setup>
defineProps({
  controlsState: {
    type: Object,
    default: () => ({})
  }
});

defineEmits(['start', 'stop', 'retry', 'clear-cache']);
</script>

<style scoped>
.live-caption-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  pointer-events: auto;
}

.live-caption-controls__button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 8px 12px;
  background: rgba(14, 18, 28, 0.84);
  color: #f5f7fb;
  cursor: pointer;
}

.live-caption-controls__button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
</style>
