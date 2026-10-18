import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SubtitleViewer from './SubtitleViewer.vue';

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (_key, fallback) => fallback }),
}));

describe('SubtitleViewer', () => {
  it('updates virtualized rows when the cue list changes', async () => {
    const wrapper = mount(SubtitleViewer, {
      props: {
        cues: [{ id: 'one', index: 1, text: 'Original one', translatedText: 'Translated one', startTime: '00:00', status: 'translated' }],
      },
    });
    Object.defineProperty(wrapper.element, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(wrapper.element, 'offsetHeight', { configurable: true, value: 400 });
    await wrapper.trigger('scroll');
    await nextTick();

    expect(wrapper.findAll('.cue-row')).toHaveLength(1);
    expect(wrapper.text()).toContain('Original one');

    await wrapper.setProps({
      cues: [
        { id: 'two', index: 2, text: 'Original two', translatedText: 'Translated two', startTime: '00:01', status: 'translated' },
        { id: 'three', index: 3, text: 'Original three', translatedText: 'Translated three', startTime: '00:02', status: 'translated' },
      ],
    });

    expect(wrapper.findAll('.cue-row')).toHaveLength(2);
    expect(wrapper.text()).toContain('Translated two');
    expect(wrapper.text()).toContain('Translated three');
  });
});
