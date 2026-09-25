import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import IconButton from './IconButton.vue'
import MaskIcon from './MaskIcon.vue'

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    safeGetURL: (path) => `chrome-extension://test-id/${path}`
  }
}))

const mountButton = (props = {}) => mount(IconButton, {
  props: {
    icon: 'settings.png',
    alt: 'Settings',
    title: 'Settings title',
    ...props
  }
})

describe('IconButton', () => {
  it('renders an img with the existing alt by default', () => {
    const wrapper = mountButton()

    expect(wrapper.element.tagName).toBe('BUTTON')
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('alt')).toBe('Settings')
    expect(img.attributes('src')).toContain('icons/ui/settings.png')
    expect(wrapper.findComponent(MaskIcon).exists()).toBe(false)
    expect(wrapper.attributes('aria-label')).toBeUndefined()
  })

  it('mask toolbar renders MaskIcon with a button-owned label', () => {
    const wrapper = mountButton({ mask: true })

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.find('img').exists()).toBe(false)
    const icon = wrapper.findComponent(MaskIcon)
    expect(icon.exists()).toBe(true)
    expect(icon.props('src')).toContain('icons/ui/settings.png')
    // Nested icon stays decorative; the button owns the accessible name.
    expect(icon.attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('aria-label')).toBe('Settings')
  })

  it('falls back to title for the button label when alt is empty', () => {
    const wrapper = mountButton({ mask: true, alt: '' })

    expect(wrapper.attributes('aria-label')).toBe('Settings title')
  })

  it('mirrors the active state on the button root', () => {
    const wrapper = mountButton({ mask: true, active: true })

    expect(wrapper.classes()).toContain('ti-active')
  })

  it('emits click once from the button root', async () => {
    const wrapper = mountButton({ mask: true })

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('mask on a non-toolbar type keeps image behavior', () => {
    const wrapper = mountButton({ mask: true, type: 'inline' })

    expect(wrapper.find('img').exists()).toBe(true)
    expect(wrapper.findComponent(MaskIcon).exists()).toBe(false)
  })
})
