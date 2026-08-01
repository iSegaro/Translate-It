import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PdfRemoteUrlDialog from './PdfRemoteUrlDialog.vue';

describe('PdfRemoteUrlDialog', () => {
  function createWrapper(props = {}) {
    return mount(PdfRemoteUrlDialog, {
      props: { visible: true, loading: false, ...props },
    });
  }

  it('renders when visible', () => {
    const wrapper = createWrapper({ visible: true });
    expect(wrapper.find('.pdf-remote-url-dialog').exists()).toBe(true);
  });

  it('does not render when not visible', () => {
    const wrapper = createWrapper({ visible: false });
    expect(wrapper.find('.pdf-remote-url-dialog').exists()).toBe(false);
  });

  it('emits close on cancel', async () => {
    const wrapper = createWrapper();
    await wrapper.find('.pdf-remote-url-dialog__cancel').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('emits close on overlay click', async () => {
    const wrapper = createWrapper();
    await wrapper.find('.pdf-remote-url-overlay').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('disables submit for empty input', () => {
    const wrapper = createWrapper();
    expect(wrapper.find('.pdf-remote-url-dialog__submit').attributes('disabled')).toBeDefined();
  });

  it('enables submit for valid HTTPS URL', async () => {
    const wrapper = createWrapper();
    await wrapper.find('.pdf-remote-url-dialog__input').setValue('https://example.com/doc.pdf');
    expect(wrapper.find('.pdf-remote-url-dialog__submit').attributes('disabled')).toBeUndefined();
  });

  it('disables submit for invalid URL', async () => {
    const wrapper = createWrapper();
    await wrapper.find('.pdf-remote-url-dialog__input').setValue('not-a-url');
    expect(wrapper.find('.pdf-remote-url-dialog__submit').attributes('disabled')).toBeDefined();
  });

  it('disables submit for non-HTTP protocol', async () => {
    const wrapper = createWrapper();
    await wrapper.find('.pdf-remote-url-dialog__input').setValue('ftp://example.com/doc.pdf');
    expect(wrapper.find('.pdf-remote-url-dialog__submit').attributes('disabled')).toBeDefined();
  });

  it('emits submit with URL on valid input', async () => {
    const wrapper = createWrapper();
    await wrapper.find('.pdf-remote-url-dialog__input').setValue('https://example.com/doc.pdf');
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.emitted('submit')).toEqual([['https://example.com/doc.pdf']]);
  });

  it('shows validation error for empty submit attempt', async () => {
    const wrapper = createWrapper();
    await wrapper.find('form').trigger('submit.prevent');
    await nextTick();
    expect(wrapper.find('.pdf-remote-url-dialog__error').exists()).toBe(true);
  });

  it('shows validation error for invalid URL', async () => {
    const wrapper = createWrapper();
    await wrapper.find('.pdf-remote-url-dialog__input').setValue('bad-url');
    await wrapper.find('form').trigger('submit.prevent');
    await nextTick();
    expect(wrapper.text()).toContain('valid URL');
  });

  it('shows "Opening..." when loading', () => {
    const wrapper = createWrapper({ loading: true });
    expect(wrapper.find('.pdf-remote-url-dialog__submit').text()).toBe('Opening...');
  });

  it('clears input when reopened', async () => {
    const wrapper = createWrapper({ visible: false });
    await wrapper.setProps({ visible: true });
    await nextTick();
    expect(wrapper.find('.pdf-remote-url-dialog__input').element.value).toBe('');
  });

  it('clears state when dialog closes', async () => {
    const wrapper = createWrapper();
    await wrapper.find('.pdf-remote-url-dialog__input').setValue('https://example.com/doc.pdf');

    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await nextTick();

    expect(wrapper.find('.pdf-remote-url-dialog__input').element.value).toBe('');
  });
});
