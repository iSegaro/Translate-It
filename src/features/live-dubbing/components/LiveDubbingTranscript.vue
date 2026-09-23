<template>
  <div
    v-if="visibleText"
    class="live-dubbing-transcript"
    dir="auto"
    aria-live="polite"
    aria-atomic="false"
  >
    {{ visibleText }}
  </div>
</template>

<script setup>
import './LiveDubbingTranscript.scss';
import { computed, onUnmounted, ref } from 'vue';
import {
  getLiveDubbingTranscriptSnapshot,
  subscribeLiveDubbingTranscript,
} from '../content/liveDubbingTranscriptStore.js';
import { getVisibleLiveDubbingTranscript } from '../content/liveDubbingTranscriptPresentation.js';

const transcript = ref(getLiveDubbingTranscriptSnapshot());
const visibleText = computed(() => getVisibleLiveDubbingTranscript(transcript.value));
const unsubscribe = subscribeLiveDubbingTranscript((snapshot) => {
  transcript.value = snapshot;
});

onUnmounted(() => {
  unsubscribe();
});
</script>
