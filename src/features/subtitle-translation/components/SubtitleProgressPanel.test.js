import { describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { mount } from '@vue/test-utils';
import SubtitleProgressPanel from './SubtitleProgressPanel.vue';

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (_key, fallback) => fallback })
}));

vi.mock('@iconify/vue', () => ({
  Icon: { template: '<i />' }
}));

vi.mock('../presentation/SubtitleTranslationErrorPresenter.js', () => ({
  presentSubtitleTranslationError: vi.fn(async ({ errorDetails, error }) => {
    if (['CONTEXT', 'EXTENSION_CONTEXT_INVALIDATED', 'TRANSLATION_CANCELLED'].includes(errorDetails?.type)) {
      return { kind: 'silent' };
    }
    return errorDetails ? { kind: 'display', message: 'Safe terminal error' } : { kind: 'legacy', message: error };
  })
}));

const createProgress = (overrides = {}) => reactive({
  percent: 100,
  translated: 1,
  failed: 1,
  total: 2,
  etaMs: 0,
  terminalError: null,
  terminalErrorDetails: null,
  ...overrides
});

describe('SubtitleProgressPanel terminal errors', () => {
  it('renders safe structured terminal text instead of raw diagnostics', async () => {
    const progress = createProgress({
      terminalError: 'raw provider body',
      terminalErrorDetails: { message: 'raw diagnostic', type: 'MODEL_NOT_FOUND' }
    });
    const wrapper = mount(SubtitleProgressPanel, { props: { progress, status: 'completed', filename: 'sample.srt' } });

    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.find('.error-msg').text()).toBe('Safe terminal error');
    expect(wrapper.text()).not.toContain('raw provider body');
    expect(wrapper.text()).not.toContain('raw diagnostic');
  });

  it('preserves legacy terminal error fallback', async () => {
    const wrapper = mount(SubtitleProgressPanel, {
      props: {
        progress: createProgress({ terminalError: 'legacy terminal failure' }),
        status: 'completed'
      }
    });

    await nextTick();
    await Promise.resolve();

    expect(wrapper.find('.error-msg').text()).toBe('legacy terminal failure');
  });

  it('does not render cancellation/context terminal errors', async () => {
    const progress = createProgress({
      terminalError: 'raw context diagnostic',
      terminalErrorDetails: { message: 'raw context diagnostic', type: 'CONTEXT' }
    });
    const wrapper = mount(SubtitleProgressPanel, { props: { progress, status: 'completed' } });

    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.find('.terminal-error-alert').exists()).toBe(false);
  });
});
