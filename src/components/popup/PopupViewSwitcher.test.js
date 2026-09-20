import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PopupViewSwitcher from './PopupViewSwitcher.vue'

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key, fallback) => fallback || key
  })
}))

describe('PopupViewSwitcher', () => {
  beforeEach(() => {
    vi.stubGlobal('__BROWSER__', 'chrome')
  })

  it('selects the translate tab by default', () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(tabs[1].attributes('aria-selected')).toBe('false')
    expect(tabs[0].classes()).toContain('is-active')
    expect(tabs[1].classes()).not.toContain('is-active')
  })

  it('emits update:modelValue when clicking the live dubbing tab', async () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    await wrapper.findAll('[role="tab"]')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['live-dubbing']])
  })

  it('emits update:modelValue when clicking the translate tab', async () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'live-dubbing', showLiveDubbing: true }
    })

    await wrapper.findAll('[role="tab"]')[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['translate']])
  })

  it('does not render the live dubbing tab when unsupported', () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: false }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(1)
    expect(tabs[0].text()).toBe('Translate')
  })

  it('labels tabs via the supplied i18n', () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[0].text()).toBe('Translate')
    expect(tabs[1].text()).toBe('Live Dubbing')
  })
})
