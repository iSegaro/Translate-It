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
  presentSubtitleTranslationError: vi.fn(async ({ errorDetails }) => {
    if (['CONTEXT', 'EXTENSION_CONTEXT_INVALIDATED', 'TRANSLATION_CANCELLED'].includes(errorDetails?.type)) {
      return { kind: 'silent' };
    }
    return typeof errorDetails?.message === 'string'
      ? { kind: 'display', message: 'Safe terminal error' }
      : { kind: 'legacy' };
  })
}));

const createProgress = (overrides = {}) => reactive({
  percent: 100,
  translated: 1,
  failed: 1,
  total: 2,
  etaMs: 0,
  terminalErrorDetails: null,
  ...overrides
});

describe('SubtitleProgressPanel terminal errors', () => {
  it('renders safe structured terminal text without a legacy terminal string', async () => {
    const progress = createProgress({
      terminalErrorDetails: { message: 'raw diagnostic', type: 'MODEL_NOT_FOUND' }
    });
    const wrapper = mount(SubtitleProgressPanel, { props: { progress, status: 'completed', filename: 'sample.srt' } });

    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.find('.error-msg').text()).toBe('Safe terminal error');
    expect(wrapper.text()).not.toContain('raw diagnostic');
  });

  it('does not render cancellation terminal errors', async () => {
    const progress = createProgress({
      terminalErrorDetails: { message: 'cancelled', type: 'TRANSLATION_CANCELLED' }
    });
    const wrapper = mount(SubtitleProgressPanel, { props: { progress, status: 'completed' } });

    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.find('.terminal-error-alert').exists()).toBe(false);
  });

  it('does not render context terminal errors', async () => {
    const progress = createProgress({
      terminalErrorDetails: { message: 'context invalidated', type: 'CONTEXT' }
    });
    const wrapper = mount(SubtitleProgressPanel, { props: { progress, status: 'completed' } });

    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.find('.terminal-error-alert').exists()).toBe(false);
  });

  it.each([
    ['missing', {}],
    ['malformed', { terminalErrorDetails: { arbitrary: true } }]
  ])('does not render %s terminal details', async (_label, overrides) => {
    const wrapper = mount(SubtitleProgressPanel, {
      props: { progress: createProgress(overrides), status: 'completed' }
    });

    await nextTick();
    await Promise.resolve();

    expect(wrapper.find('.terminal-error-alert').exists()).toBe(false);
  });

  it('does not restore stale presentation after details change', async () => {
    let resolveFirst;
    const firstPresentation = new Promise(resolve => { resolveFirst = resolve; });
    const presenter = vi.mocked((await import('../presentation/SubtitleTranslationErrorPresenter.js'))
      .presentSubtitleTranslationError);
    presenter.mockImplementationOnce(() => firstPresentation)
      .mockResolvedValueOnce({ kind: 'silent' });

    const progress = createProgress({
      terminalErrorDetails: { message: 'first', type: 'MODEL_NOT_FOUND' }
    });
    const wrapper = mount(SubtitleProgressPanel, { props: { progress, status: 'completed' } });

    progress.terminalErrorDetails = { message: 'cancelled', type: 'TRANSLATION_CANCELLED' };
    await nextTick();
    await Promise.resolve();
    resolveFirst({ kind: 'display', message: 'stale alert' });
    await nextTick();
    await Promise.resolve();

    expect(wrapper.find('.terminal-error-alert').exists()).toBe(false);
  });
});
