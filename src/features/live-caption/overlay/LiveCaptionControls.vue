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
      :disabled="Boolean(controlsState?.canPause === false)"
      @click="$emit('pause')"
    >
      Pause
    </button>
    <button
      type="button"
      class="live-caption-controls__button"
      :disabled="Boolean(controlsState?.canResume === false)"
      @click="$emit('resume')"
    >
      Resume
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

defineEmits(['start', 'stop', 'pause', 'resume', 'retry', 'clear-cache']);
</script>
