import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LiveDubbingView from './LiveDubbingView.vue'

// Stubbed children: this suite covers ONLY the view-level wiring contract
// (target-only selector mode + prop forwarding). LiveDubbingControl behavior
// itself is covered by LiveDubbingControl.test.js and must not be duplicated.
const LanguageSelectorStub = {
  name: 'LanguageSelector',
  props: {
    targetLanguage: { type: String, default: 'en' },
    provider: { type: String, default: '' },
    enableSelectElementIntegration: { type: Boolean, default: true },
    targetOnly: { type: Boolean, default: false }
  },
  emits: ['update:targetLanguage'],
  template: '<div class="language-selector-stub" />'
}

const LiveDubbingControlStub = {
  name: 'LiveDubbingControl',
  props: {
    targetLanguage: { type: String, default: '' },
    providerId: { type: String, default: '' }
  },
  emits: ['busy-change'],
  template: '<div class="live-dubbing-control-stub" />'
}

const mountView = (props = {}) => mount(LiveDubbingView, {
  props: { targetLanguage: 'en', providerId: 'gemini', ...props },
  global: {
    stubs: {
      LanguageSelector: LanguageSelectorStub,
      LiveDubbingControl: LiveDubbingControlStub
    }
  }
})

describe('LiveDubbingView', () => {
  it('renders the LanguageSelector in target-only mode', () => {
    const wrapper = mountView({ providerId: 'openai' })

    const selector = wrapper.findComponent({ name: 'LanguageSelector' })
    expect(selector.exists()).toBe(true)
    expect(selector.props('targetOnly')).toBe(true)
    expect(selector.props('enableSelectElementIntegration')).toBe(false)
    expect(selector.props('provider')).toBe('openai')
  })

  it('forwards the selected target language to LiveDubbingControl', async () => {
    const wrapper = mountView()

    // A selection inside the LanguageSelector flows up as update:targetLanguage;
    // the parent owns the prop, so the view re-emits it unchanged.
    await wrapper.findComponent({ name: 'LanguageSelector' }).vm.$emit('update:targetLanguage', 'de')
    expect(wrapper.emitted('update:targetLanguage')).toEqual([['de']])

    // Once the parent applies the new prop, the control receives it.
    await wrapper.setProps({ targetLanguage: 'de' })
    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).props('targetLanguage')).toBe('de')
  })

  it('forwards the selected provider to the selector and the control', async () => {
    const wrapper = mountView()

    await wrapper.setProps({ providerId: 'openai' })
    expect(wrapper.findComponent({ name: 'LanguageSelector' }).props('provider')).toBe('openai')
    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).props('providerId')).toBe('openai')
  })
})
