import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MaskIcon from './MaskIcon.vue'

const SVG_SRC = 'chrome-extension://test-id/icons/ui/close.svg'
const PNG_SRC = 'chrome-extension://test-id/icons/ui/clear.png'

const mountIcon = (props = {}) => mount(MaskIcon, {
  props: { src: SVG_SRC, ...props }
})

describe('MaskIcon', () => {
  it('renders an SVG URL as a CSS mask URL', () => {
    const wrapper = mountIcon()

    expect(wrapper.element.style.getPropertyValue('mask-image')).toBe(`url("${SVG_SRC}")`)
    expect(wrapper.element.style.getPropertyValue('-webkit-mask-image')).toBe(`url("${SVG_SRC}")`)
  })

  it('accepts a PNG URL through the same mask code path', () => {
    const wrapper = mountIcon({ src: PNG_SRC })

    expect(wrapper.element.style.getPropertyValue('mask-image')).toBe(`url("${PNG_SRC}")`)
    expect(wrapper.element.style.getPropertyValue('-webkit-mask-image')).toBe(`url("${PNG_SRC}")`)
  })

  it('converts a numeric size to px', () => {
    const wrapper = mountIcon({ size: 18 })

    expect(wrapper.element.style.getPropertyValue('width')).toBe('18px')
    expect(wrapper.element.style.getPropertyValue('height')).toBe('18px')
  })

  it('preserves a string size unit', () => {
    const wrapper = mountIcon({ size: '1.5em' })

    expect(wrapper.element.style.getPropertyValue('width')).toBe('1.5em')
    expect(wrapper.element.style.getPropertyValue('height')).toBe('1.5em')
  })

  it('is decorative by default', () => {
    const wrapper = mountIcon()

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.attributes('aria-label')).toBeUndefined()
  })

  it('exposes role=img with aria-label when ariaLabel is set', () => {
    const wrapper = mountIcon({ ariaLabel: 'Close' })

    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe('Close')
    expect(wrapper.attributes('aria-hidden')).toBeUndefined()
  })
})
