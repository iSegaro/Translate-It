import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ProgressIndicator from './ProgressIndicator.vue'

describe('ProgressIndicator', () => {
  it('renders as progressbar', () => {
    const wrapper = mount(ProgressIndicator, {
      props: { progress: 50, indeterminate: false }
    })
    const el = wrapper.find('.progress-indicator')
    expect(el.exists()).toBe(true)
    expect(el.attributes('role')).toBe('progressbar')

    wrapper.unmount()
  })

  it('shows determinate progress width', () => {
    const wrapper = mount(ProgressIndicator, {
      props: { progress: 75, indeterminate: false }
    })
    expect(wrapper.find('.progress-indicator').attributes('style')).toContain('width: 75%')

    wrapper.unmount()
  })

  it('clamps progress to 0-100 range', () => {
    const wrapper = mount(ProgressIndicator, {
      props: { progress: 150, indeterminate: false }
    })
    expect(wrapper.find('.progress-indicator').attributes('style')).toContain('width: 100%')

    wrapper.unmount()
  })

  it('applies indeterminate aria-busy', () => {
    const wrapper = mount(ProgressIndicator, {
      props: { progress: null, indeterminate: true }
    })
    expect(wrapper.find('.progress-indicator').attributes('aria-busy')).toBe('true')

    wrapper.unmount()
  })

  it('sets aria-valuenow for determinate progress', () => {
    const wrapper = mount(ProgressIndicator, {
      props: { progress: 42, indeterminate: false }
    })
    const el = wrapper.find('.progress-indicator')
    expect(el.attributes('aria-valuenow')).toBe('42')
    expect(el.attributes('aria-valuemin')).toBe('0')
    expect(el.attributes('aria-valuemax')).toBe('100')

    wrapper.unmount()
  })

  it('omits aria-valuenow when indeterminate', () => {
    const wrapper = mount(ProgressIndicator, {
      props: { progress: null, indeterminate: true }
    })
    const el = wrapper.find('.progress-indicator')
    expect(el.attributes('aria-valuenow')).toBeUndefined()
    expect(el.attributes('aria-valuemin')).toBeUndefined()
    expect(el.attributes('aria-valuemax')).toBeUndefined()

    wrapper.unmount()
  })

  it('has no child elements', () => {
    const wrapper = mount(ProgressIndicator, {
      props: { progress: 50, indeterminate: false }
    })
    expect(wrapper.find('.progress-indicator').element.children.length).toBe(0)

    wrapper.unmount()
  })
})
