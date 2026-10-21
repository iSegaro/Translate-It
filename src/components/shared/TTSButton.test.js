import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import TTSButton from './TTSButton.vue';

// Keys are returned verbatim by this suite's i18n mock, so asserting a title
// of `action_speak_text` verifies the default wording is wired through.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
    operation: vi.fn(),
  }),
}));

// Minimal base button: only forwards the props TTSButton asserts on.
vi.mock('@/features/text-actions/components/BaseActionButton.vue', () => ({
  default: {
    name: 'BaseActionButton',
    props: ['size', 'variant', 'disabled', 'title', 'label', 'showLabel', 'customClasses'],
    template: '<button class="base-action-stub" :title="title">{{ label }}</button>',
  },
}));

// Controllable TTS singleton state, mirroring how other suites mock
// useTTSSmart (InputView.test.js) to drive ttsState/currentTTSId.
const { ttsTestState } = vi.hoisted(() => ({ ttsTestState: { current: null } }));

vi.mock('@/features/tts/composables/useTTSSmart.js', async () => {
  const { ref, computed } = await import('vue');

  const ttsState = ref('idle');
  const currentTTSId = ref(null);
  const lastText = ref('');
  const errorType = ref('');
  const errorMessage = ref('');
  const canStop = computed(() => ttsState.value === 'playing');

  const speak = vi.fn(async (text) => {
    lastText.value = text;
    currentTTSId.value = `tts-${text}`;
    ttsState.value = 'playing';
    return true;
  });

  const stop = vi.fn(async () => {
    ttsState.value = 'idle';
    currentTTSId.value = null;
    return true;
  });

  const state = { ttsState, currentTTSId, lastText, errorType, errorMessage, canStop, speak, stop };
  ttsTestState.current = state;

  return { useTTSSmart: () => state };
});

const resetTTSState = () => {
  const state = ttsTestState.current;
  if (!state) return;
  state.ttsState.value = 'idle';
  state.currentTTSId.value = null;
  state.lastText.value = '';
  state.errorType.value = '';
  state.errorMessage.value = '';
  state.speak.mockClear();
  state.stop.mockClear();
};

const mountTTS = (extraProps = {}) =>
  mount(TTSButton, { props: { text: 'hello', language: 'auto', ...extraProps } });

const getBaseActionButton = (wrapper) => wrapper.findComponent({ name: 'BaseActionButton' });

describe('TTSButton.vue', () => {
  beforeEach(() => {
    resetTTSState();
  });

  it('shows the contextual idle tooltip verbatim and switches to the playing tooltip during playback', async () => {
    const wrapper = mountTTS({ idleTooltip: 'window_tts_speak_original', playingTooltip: 'window_tts_stop' });
    const title = () => getBaseActionButton(wrapper).props('title');

    expect(title()).toBe('window_tts_speak_original');

    await getBaseActionButton(wrapper).trigger('click');
    await flushPromises();
    expect(ttsTestState.current.ttsState.value).toBe('playing');
    expect(title()).toBe('window_tts_stop');
  });

  it('keeps the previous default titles when no contextual tooltips are provided', async () => {
    const wrapper = mountTTS();
    const title = () => getBaseActionButton(wrapper).props('title');

    expect(title()).toBe('action_speak_text');

    await getBaseActionButton(wrapper).trigger('click');
    await flushPromises();
    expect(ttsTestState.current.ttsState.value).toBe('playing');
    expect(title()).toBe('action_stop_speaking');
  });
});
