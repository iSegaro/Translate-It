import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import LiveCaptionConsentNotice from './LiveCaptionConsentNotice.vue';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('LiveCaptionConsentNotice', () => {
  it('renders privacy notice text for normal mode', () => {
    const wrapper = mount(LiveCaptionConsentNotice, {
      props: {
        visible: true
      }
    });

    expect(wrapper.text()).toContain('tab audio');
    expect(wrapper.text()).toContain('Raw audio is not persisted');
    expect(wrapper.text()).toContain('may be cached');
  });

  it('renders privacy notice text for incognito mode', () => {
    const wrapper = mount(LiveCaptionConsentNotice, {
      props: {
        visible: true,
        isIncognito: true
      }
    });

    expect(wrapper.text()).toContain('session-only');
  });

  it('emits accept and cancel only', async () => {
    const wrapper = mount(LiveCaptionConsentNotice, {
      props: {
        visible: true
      }
    });

    const buttons = wrapper.findAll('button');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');

    expect(wrapper.emitted('accept')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
