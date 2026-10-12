import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ApiKeyInput from './ApiKeyInput.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: key => ({ api_test_button: 'Test Keys', api_test_testing: 'Testing...' }[key] || key) }),
}));

vi.mock('@/components/base/BaseTextarea.vue', () => ({
  default: {
    props: ['modelValue', 'placeholder', 'rows', 'passwordMask', 'hideToggle'],
    template: '<textarea :value="modelValue" />',
  },
}));

describe('ApiKeyInput Test Keys control', () => {
  const mountInput = props => mount(ApiKeyInput, {
    props: { providerId: 'test-provider', modelValue: 'key', ...props },
  });

  it('keeps Test Keys enabled by default for existing providers', () => {
    const wrapper = mountInput();

    expect(wrapper.get('.test-keys-button').element.disabled).toBe(false);
    expect(wrapper.get('.test-keys-button').text()).toBe('Test Keys');
  });

  it('disables testing without changing the button label', () => {
    const wrapper = mountInput({ testDisabled: true });

    expect(wrapper.get('.test-keys-button').element.disabled).toBe(true);
    expect(wrapper.get('.test-keys-button').text()).toBe('Test Keys');
  });

  it('keeps the loading label controlled only by testing', () => {
    const wrapper = mountInput({ testing: true, testDisabled: true });

    expect(wrapper.get('.test-keys-button').element.disabled).toBe(true);
    expect(wrapper.get('.test-keys-button').text()).toBe('Testing...');
  });
});
