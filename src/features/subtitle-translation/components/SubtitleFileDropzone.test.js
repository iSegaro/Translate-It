import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SubtitleFileDropzone from './SubtitleFileDropzone.vue';
import MaskIcon from '@/components/shared/MaskIcon.vue';

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (_key, fallback) => fallback }),
}));

describe('SubtitleFileDropzone icons', () => {
  it('switches between the local upload and selected-file icons', async () => {
    const wrapper = mount(SubtitleFileDropzone);
    const icon = wrapper.findComponent(MaskIcon);
    const uploadSrc = icon.props('src');
    expect(uploadSrc).toMatch(/^data:image\/svg\+xml/);
    expect(icon.attributes('aria-hidden')).toBe('true');

    await wrapper.setProps({ modelValue: new File(['subtitle'], 'sample.srt') });
    const selectedFileSrc = wrapper.findComponent(MaskIcon).props('src');
    expect(selectedFileSrc).toMatch(/^data:image\/svg\+xml/);
    expect(selectedFileSrc).not.toBe(uploadSrc);
  });
});
