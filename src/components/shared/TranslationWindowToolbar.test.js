import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TranslationWindowToolbar from './TranslationWindowToolbar.vue';
import { readFileSync } from 'node:fs';

vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    name: 'ProviderSelector',
    props: {
      modelValue: { type: String, default: '' },
      mode: { type: String, default: '' },
      isGlobal: { type: Boolean, default: false },
      allowDefault: { type: Boolean, default: false },
      allowSetDefault: { type: Boolean, default: false },
      onlyConfigured: { type: Boolean, default: false },
      requiredFeature: { type: String, default: '' },
    },
    template: `
      <button
        class="provider-selector-stub"
        @click="$emit('update:modelValue', 'deepl')"
      >
        provider
      </button>
    `,
  },
}));

vi.mock('@/components/shared/TTSButton.vue', () => ({
  default: {
    name: 'TTSButton',
    props: {
      text: { type: String, default: '' },
      language: { type: String, default: '' },
      isDictionary: { type: Boolean, default: false },
    },
    template: `
      <div class="tts-button-stub">
        <button class="tts-start" @click="$emit('tts-started', { text })">start</button>
        <button class="tts-stop" @click="$emit('tts-stopped')">stop</button>
        <button class="tts-error" @click="$emit('tts-error', 'boom')">error</button>
        <button class="tts-state" @click="$emit('state-changed', 'playing')">state</button>
      </div>
    `,
  },
}));

describe('TranslationWindowToolbar.vue', () => {
  const baseProps = {
    provider: 'googlev2',
    theme: 'light',
    isPinned: false,
    showOriginal: false,
    isDictionary: false,
    ttsText: 'hello',
    ttsLanguage: 'en',
    targetLanguageLabel: 'Persian',
    detectedLanguageLabel: 'English',
    pinTitle: 'window_pin',
    copyTitle: 'window_copy_translation',
    originalTitle: 'window_show_original',
    closeTitle: 'window_close',
    providerSelectorMode: 'icon-only',
    providerSelectorIsGlobal: false,
    providerSelectorAllowDefault: false,
    providerSelectorAllowSetDefault: true,
    providerSelectorOnlyConfigured: true,
    providerSelectorRequiredFeature: 'translation',
  };

  it('renders the shared window controls and labels', () => {
    const wrapper = mount(TranslationWindowToolbar, {
      props: baseProps,
    });

    expect(wrapper.findComponent({ name: 'ProviderSelector' }).props('mode')).toBe('icon-only');
    expect(wrapper.findComponent({ name: 'ProviderSelector' }).props('isGlobal')).toBe(false);
    expect(wrapper.findComponent({ name: 'ProviderSelector' }).props('allowDefault')).toBe(false);
    expect(wrapper.findComponent({ name: 'ProviderSelector' }).props('allowSetDefault')).toBe(true);
    expect(wrapper.findComponent({ name: 'ProviderSelector' }).props('onlyConfigured')).toBe(true);
    expect(wrapper.find('.provider-selector-stub').exists()).toBe(true);
    expect(wrapper.find('.tts-button-stub').exists()).toBe(true);
    expect(wrapper.find('.ti-action-btn[title="window_pin"]').exists()).toBe(true);
    expect(wrapper.find('.ti-action-btn[title="window_copy_translation"]').exists()).toBe(true);
    expect(wrapper.find('.ti-action-btn[title="window_show_original"]').exists()).toBe(true);
    expect(wrapper.find('.ti-target-language-label').text()).toBe('Persian');
    expect(wrapper.find('.ti-detected-language-label').text()).toBe('English');
    expect(wrapper.find('.ti-action-btn[title="window_close"]').exists()).toBe(true);
    expect(wrapper.find('.ti-action-btn[title*="dock"]').exists()).toBe(false);
  });

  it('emits toolbar events exactly once', async () => {
    const wrapper = mount(TranslationWindowToolbar, {
      props: baseProps,
    });

    await wrapper.find('.provider-selector-stub').trigger('click');
    expect(wrapper.emitted('provider-change')).toEqual([['deepl']]);

    await wrapper.find('.ti-action-btn[title="window_pin"]').trigger('click');
    expect(wrapper.emitted('toggle-pin')).toEqual([[]]);

    await wrapper.find('.ti-action-btn[title="window_copy_translation"]').trigger('click');
    expect(wrapper.emitted('copy')).toEqual([[]]);

    await wrapper.find('.tts-start').trigger('click');
    expect(wrapper.emitted('tts-started')).toEqual([[{ text: 'hello' }]]);

    await wrapper.find('.tts-stop').trigger('click');
    expect(wrapper.emitted('tts-stopped')).toEqual([[]]);

    await wrapper.find('.tts-error').trigger('click');
    expect(wrapper.emitted('tts-error')).toEqual([['boom']]);

    await wrapper.find('.tts-state').trigger('click');
    expect(wrapper.emitted('tts-state-changed')).toEqual([['playing']]);

    await wrapper.find('.ti-action-btn[title="window_show_original"]').trigger('click');
    expect(wrapper.emitted('toggle-original')).toEqual([[]]);

    await wrapper.find('.ti-action-btn[title="window_close"]').trigger('click');
    expect(wrapper.emitted('close')).toEqual([[]]);
  });

  it('does not import the WindowsManager stack', () => {
    const source = readFileSync('src/components/shared/TranslationWindowToolbar.vue', 'utf8');

    expect(source).not.toContain('@/features/windows');
    expect(source).not.toContain('src/features/windows');
    expect(source).toContain("import './TranslationWindowToolbar.scss'");
  });
});
