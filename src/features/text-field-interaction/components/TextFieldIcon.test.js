import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import TextFieldIcon from './TextFieldIcon.vue';

// Mock composables
vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({
    trackTimeout: vi.fn((fn, delay) => setTimeout(fn, delay))
  })
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: vi.fn((key) => key)
  })
}));

vi.mock('@/store/modules/mobile.js', () => ({
  useMobileStore: () => ({
    isFullscreen: false
  })
}));

describe('TextFieldIcon.vue', () => {
  const defaultProps = {
    id: 'test-icon',
    position: { top: 100, left: 200, placement: 'top-right' },
    positioningMode: 'absolute'
  };

  it('should render correctly with given position', () => {
    const wrapper = mount(TextFieldIcon, {
      props: defaultProps
    });

    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
    expect(button.attributes('id')).toBe('test-icon');
    
    const style = button.attributes('style');
    expect(style).toContain('top: 100px');
    expect(style).toContain('left: 200px');
    expect(style).toContain('position: absolute');
  });

  it('should apply correct placement transform', () => {
    const wrapper = mount(TextFieldIcon, {
      props: {
        ...defaultProps,
        position: { top: 100, left: 200, placement: 'top-right' }
      }
    });

    const style = wrapper.find('button').attributes('style');
    expect(style).toContain('transform: translate(-100%, 0)');
  });

  it('should emit click event when clicked', async () => {
    const wrapper = mount(TextFieldIcon, {
      props: defaultProps
    });

    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('click')).toBeTruthy();
    expect(wrapper.emitted('click')[0][0]).toBe('test-icon');
  });

  it('should NOT render when visible is false', () => {
    const wrapper = mount(TextFieldIcon, {
      props: {
        ...defaultProps,
        visible: false
      }
    });

    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('should handle keyboard interaction (Enter)', async () => {
    const wrapper = mount(TextFieldIcon, {
      props: defaultProps
    });

    await wrapper.find('button').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('click')).toBeTruthy();
  });

  it('should update position when prop changes', async () => {
    const wrapper = mount(TextFieldIcon, {
      props: defaultProps
    });

    await wrapper.setProps({
      position: { top: 300, left: 400, placement: 'bottom-left' }
    });

    const style = wrapper.find('button').attributes('style');
    expect(style).toContain('top: 300px');
    expect(style).toContain('left: 400px');
    expect(wrapper.emitted('position-updated')).toBeTruthy();
  });
});
