<template>
  <div
    v-if="(showTranslatedTranscript && visibleText) || (showOriginalTranscript && visibleSourceText)"
    class="live-dubbing-transcript"
    :style="transcriptStyle"
  >
    <div
      v-if="showOriginalTranscript && visibleSourceText"
      class="live-dubbing-transcript__source"
      dir="auto"
    >
      <span class="live-dubbing-transcript__text">{{ visibleSourceText }}</span>
    </div>
    <div
      v-if="showTranslatedTranscript && visibleText"
      class="live-dubbing-transcript__translated"
      dir="auto"
    >
      <span class="live-dubbing-transcript__text">{{ visibleText }}</span>
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
import {
  LIVE_DUBBING_SUBTITLE_SIZE_PRESETS,
  normalizeLiveDubbingSubtitleSize,
} from '../content/liveDubbingSubtitleSize.js';

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
  fontFamily: {
    type: String,
    default: '',
  },
  subtitleSize: {
    type: String,
    default: 'medium',
  },
});
const { showTranslatedTranscript, showOriginalTranscript, fontFamily, subtitleSize } = toRefs(props);
const visibleText = computed(() => getVisibleLiveDubbingTranscript(transcript.value));
const visibleSourceText = computed(() => getVisibleLiveDubbingSourceTranscript(transcript.value));
const transcriptStyle = computed(() => {
  const preset = LIVE_DUBBING_SUBTITLE_SIZE_PRESETS[normalizeLiveDubbingSubtitleSize(subtitleSize.value)];
  const style = {
    '--ti-live-dubbing-original-font-size': preset.original,
    '--ti-live-dubbing-translated-font-size': preset.translated,
  };
  if (fontFamily.value) style['--ti-live-dubbing-font-family'] = fontFamily.value;
  return style;
});
const unsubscribe = subscribeLiveDubbingTranscript((snapshot) => {
  transcript.value = snapshot;
});

onUnmounted(() => {
  unsubscribe();
});
</script>
