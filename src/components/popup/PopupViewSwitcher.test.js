import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
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
  const RealResizeObserver = globalThis.ResizeObserver
  let observeSpy
  let disconnectSpy
  let observerCallback

  beforeEach(() => {
    vi.stubGlobal('__BROWSER__', 'chrome')
    mockT.mockClear()
    observeSpy = vi.fn()
    disconnectSpy = vi.fn()
    observerCallback = null
    vi.stubGlobal('ResizeObserver', vi.fn(function (cb) {
      observerCallback = cb
      this.observe = observeSpy
      this.disconnect = disconnectSpy
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (RealResizeObserver !== undefined) {
      globalThis.ResizeObserver = RealResizeObserver
    }
  })

  function mockTabLayout(el, left, width) {
    Object.defineProperty(el, 'offsetLeft', { value: left, configurable: true })
    Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true })
  }

  function pillEl(wrapper) {
    return wrapper.find('.ti-popup-view-switcher__pill')
  }

  it('uses the underscore i18n key for the live dubbing label', () => {
    mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    expect(mockT).toHaveBeenCalledWith('popup_view_live_dubbing', 'Live Dubbing')
    expect(mockT).not.toHaveBeenCalledWith('popup_view_live-dubbing', expect.anything())
  })

  it('renders icon-plus-label tabs with accessible labels', () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)

    const translateTab = tabs[0]
    // Accessible name matches the visible label; tooltip keeps the detailed text.
    expect(translateTab.attributes('aria-label')).toBe('Text')
    expect(translateTab.attributes('title')).toBe('Translate')
    // Decorative mask icon: no <img>, parent tab owns the accessible label.
    expect(translateTab.find('img').exists()).toBe(false)
    const translateIcon = translateTab.findComponent(MaskIcon)
    expect(translateIcon.exists()).toBe(true)
    expect(translateIcon.props('src')).toContain('icons/ui/translate-view.png')
    expect(translateIcon.attributes('aria-hidden')).toBe('true')
    // Visible label uses its own i18n key (echo-mock returns the fallback).
    expect(mockT).toHaveBeenCalledWith('popup_view_switcher_translate_label', 'Text')
    const translateLabel = translateTab.find('.ti-popup-view-switcher__label')
    expect(translateLabel.exists()).toBe(true)
    expect(translateLabel.text()).toBe('Text')
    expect(translateLabel.attributes('aria-hidden')).toBe('true')

    const dubbingTab = tabs[1]
    // Accessible name matches the visible label; tooltip keeps the detailed text.
    expect(dubbingTab.attributes('aria-label')).toBe('Dubbing')
    expect(dubbingTab.attributes('title')).toBe('Live Dubbing')
    expect(dubbingTab.find('img').exists()).toBe(false)
    const dubbingIcon = dubbingTab.findComponent(MaskIcon)
    expect(dubbingIcon.exists()).toBe(true)
    expect(dubbingIcon.props('src')).toContain('icons/ui/dubbing.png')
    expect(dubbingIcon.attributes('aria-hidden')).toBe('true')
    expect(mockT).toHaveBeenCalledWith('popup_view_switcher_dubbing_label', 'Dubbing')
    const dubbingLabel = dubbingTab.find('.ti-popup-view-switcher__label')
    expect(dubbingLabel.exists()).toBe(true)
    expect(dubbingLabel.text()).toBe('Dubbing')
    expect(dubbingLabel.attributes('aria-hidden')).toBe('true')
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
    expect(tabs[0].attributes('aria-label')).toBe('Text')
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

  it('renders a single decorative pill as the first child of the tablist', () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    const container = wrapper.find('[role="tablist"]')
    expect(container.exists()).toBe(true)
    const pill = pillEl(wrapper)
    expect(pill.exists()).toBe(true)
    expect(pill.element.tagName).toBe('SPAN')
    expect(pill.attributes('aria-hidden')).toBe('true')
    // Decorative only: no role, not focusable.
    expect(pill.attributes('role')).toBeUndefined()
    expect(pill.attributes('tabindex')).toBeUndefined()
    expect(container.element.firstElementChild).toBe(pill.element)
  })

  it('positions the pill from the active tab measurements', async () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'live-dubbing', showLiveDubbing: true }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    mockTabLayout(tabs[0].element, 2, 80)
    mockTabLayout(tabs[1].element, 86, 100)
    await nextTick()
    await nextTick()

    const pill = pillEl(wrapper)
    expect(pill.element.style.left).toBe('86px')
    expect(pill.element.style.width).toBe('100px')
  })

  it('resyncs the pill when modelValue changes', async () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    mockTabLayout(tabs[0].element, 2, 80)
    mockTabLayout(tabs[1].element, 86, 100)
    await nextTick()
    await nextTick()
    expect(pillEl(wrapper).element.style.left).toBe('2px')

    await wrapper.setProps({ modelValue: 'live-dubbing' })
    await nextTick()
    await nextTick()
    const pill = pillEl(wrapper)
    expect(pill.element.style.left).toBe('86px')
    expect(pill.element.style.width).toBe('100px')
  })

  it('keeps the pill on the Text tab without error when dubbing is hidden', async () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: false }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(1)
    mockTabLayout(tabs[0].element, 2, 90)
    await nextTick()
    await nextTick()

    const pill = pillEl(wrapper)
    expect(pill.exists()).toBe(true)
    expect(pill.element.style.left).toBe('2px')
    expect(pill.element.style.width).toBe('90px')
  })

  it('observes container layout with ResizeObserver and disconnects on unmount', async () => {
    const wrapper = mount(PopupViewSwitcher, {
      props: { modelValue: 'translate', showLiveDubbing: true }
    })

    expect(vi.mocked(globalThis.ResizeObserver)).toHaveBeenCalledTimes(1)
    expect(observeSpy).toHaveBeenCalledTimes(1)
    expect(observeSpy).toHaveBeenCalledWith(wrapper.find('[role="tablist"]').element)

    // Layout change resyncs without throwing, even with zeroed JSDOM layout.
    const tabs = wrapper.findAll('[role="tab"]')
    mockTabLayout(tabs[0].element, 2, 80)
    observerCallback?.()
    await nextTick()
    await nextTick()
    expect(pillEl(wrapper).element.style.width).toBe('80px')

    wrapper.unmount()
    expect(disconnectSpy).toHaveBeenCalledTimes(1)
  })
})
