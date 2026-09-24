<template>
  <div
    v-if="(showTranslatedTranscript && visibleText) || (showOriginalTranscript && visibleSourceText)"
    class="live-dubbing-transcript"
    aria-live="polite"
    aria-atomic="false"
  >
    <div
      v-if="showOriginalTranscript && visibleSourceText"
      class="live-dubbing-transcript__source"
      dir="auto"
    >
      {{ visibleSourceText }}
    </div>
    <div
      v-if="showTranslatedTranscript && visibleText"
      class="live-dubbing-transcript__translated"
      dir="auto"
    >
      {{ visibleText }}
    </div>
  </div>
</template>

<script setup>
import './LiveDubbingTranscript.scss';
import { computed, onUnmounted, ref, toRefs } from 'vue';
import {
  getLiveDubbingTranscriptSnapshot,
  subscribeLiveDubbingTranscript,
} from '../content/liveDubbingTranscriptStore.js';
import {
  getVisibleLiveDubbingSourceTranscript,
  getVisibleLiveDubbingTranscript,
} from '../content/liveDubbingTranscriptPresentation.js';

const transcript = ref(getLiveDubbingTranscriptSnapshot());
const props = defineProps({
  showTranslatedTranscript: {
    type: Boolean,
    default: false,
  },
  showOriginalTranscript: {
    type: Boolean,
    default: false,
  },
});
const { showTranslatedTranscript, showOriginalTranscript } = toRefs(props);
const visibleText = computed(() => getVisibleLiveDubbingTranscript(transcript.value));
const visibleSourceText = computed(() => getVisibleLiveDubbingSourceTranscript(transcript.value));
const unsubscribe = subscribeLiveDubbingTranscript((snapshot) => {
  transcript.value = snapshot;
});

onUnmounted(() => {
  unsubscribe();
});
</script>
