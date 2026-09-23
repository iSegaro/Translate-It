<template>
  <div
    v-if="visibleText || visibleSourceText"
    class="live-dubbing-transcript"
    aria-live="polite"
    aria-atomic="false"
  >
    <div
      v-if="visibleSourceText"
      class="live-dubbing-transcript__source"
      dir="auto"
    >
      {{ visibleSourceText }}
    </div>
    <div
      v-if="visibleText"
      class="live-dubbing-transcript__translated"
      dir="auto"
    >
      {{ visibleText }}
    </div>
  </div>
</template>

<script setup>
import './LiveDubbingTranscript.scss';
import { computed, onUnmounted, ref } from 'vue';
import {
  getLiveDubbingTranscriptSnapshot,
  subscribeLiveDubbingTranscript,
} from '../content/liveDubbingTranscriptStore.js';
import {
  getVisibleLiveDubbingSourceTranscript,
  getVisibleLiveDubbingTranscript,
} from '../content/liveDubbingTranscriptPresentation.js';

const transcript = ref(getLiveDubbingTranscriptSnapshot());
const visibleText = computed(() => getVisibleLiveDubbingTranscript(transcript.value));
const visibleSourceText = computed(() => getVisibleLiveDubbingSourceTranscript(transcript.value));
const unsubscribe = subscribeLiveDubbingTranscript((snapshot) => {
  transcript.value = snapshot;
});

onUnmounted(() => {
  unsubscribe();
});
</script>
