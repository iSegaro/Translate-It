import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PopupViewSwitcher from './PopupViewSwitcher.vue'
import MaskIcon from '@/components/shared/MaskIcon.vue'

const { mockT } = vi.hoisted(() => ({
  mockT: vi.fn((key, fallback) => fallback || key)
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: mockT
  })
}))

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    safeGetURL: (path) => `chrome-extension://test-id/${path}`
  }
}))

describe('PopupViewSwitcher', () => {
  beforeEach(() => {
    vi.stubGlobal('__BROWSER__', 'chrome')
    mockT.mockClear()
  })

  it('uses the underscore i18n key for the live dubbing label', () => {
    mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    expect(mockT).toHaveBeenCalledWith('popup_view_live_dubbing', 'Live Dubbing')
    expect(mockT).not.toHaveBeenCalledWith('popup_view_live-dubbing', expect.anything())
  })

  it('renders icon-only tabs with accessible labels', () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)

    const translateTab = tabs[0]
    expect(translateTab.attributes('aria-label')).toBe('Translate')
    expect(translateTab.attributes('title')).toBe('Translate')
    // Decorative mask icon: no <img>, parent tab owns the accessible label.
    expect(translateTab.find('img').exists()).toBe(false)
    const translateIcon = translateTab.findComponent(MaskIcon)
    expect(translateIcon.exists()).toBe(true)
    expect(translateIcon.props('src')).toContain('icons/ui/translate-view.png')
    expect(translateIcon.attributes('aria-hidden')).toBe('true')

    const dubbingTab = tabs[1]
    expect(dubbingTab.attributes('aria-label')).toBe('Live Dubbing')
    expect(dubbingTab.attributes('title')).toBe('Live Dubbing')
    expect(dubbingTab.find('img').exists()).toBe(false)
    const dubbingIcon = dubbingTab.findComponent(MaskIcon)
    expect(dubbingIcon.exists()).toBe(true)
    expect(dubbingIcon.props('src')).toContain('icons/ui/dubbing.png')
    expect(dubbingIcon.attributes('aria-hidden')).toBe('true')
  })

  it('marks the active tab with aria-selected', () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'live-dubbing', showLiveDubbing: true }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[0].attributes('aria-selected')).toBe('false')
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(tabs[0].classes()).not.toContain('is-active')
    expect(tabs[1].classes()).toContain('is-active')
  })

  it('emits update:modelValue when clicking a tab', async () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['live-dubbing']])

    await wrapper.setProps({ modelValue: 'live-dubbing' })
    await wrapper.findAll('[role="tab"]')[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['live-dubbing'], ['translate']])
  })

  it('renders only the translate tab when live dubbing is unsupported', () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: false }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(1)
    expect(tabs[0].attributes('aria-label')).toBe('Translate')
  })

  it('tabs are natively keyboard-focusable buttons', () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    for (const tab of tabs) {
      expect(tab.element.tagName).toBe('BUTTON')
      expect(tab.attributes('type')).toBe('button')
      // No positive tabindex and not disabled: reachable via keyboard,
      // with the :focus-visible outline provided by PopupViewSwitcher.scss.
      expect(tab.attributes('tabindex')).toBeUndefined()
      expect(tab.attributes('disabled')).toBeUndefined()
    }
  })
})
