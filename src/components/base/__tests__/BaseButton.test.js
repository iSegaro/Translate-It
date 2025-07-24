import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import BaseButton from '../BaseButton.vue'

describe('BaseButton', () => {
  it('renders correctly with default props', () => {
    const wrapper = mount(BaseButton)
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.classes()).toContain('base-button')
  })

  it('renders text content', () => {
    const wrapper = mount(BaseButton, {
      props: { text: 'Click me' }
    })
    expect(wrapper.text()).toContain('Click me')
  })

  it('renders slot content', () => {
    const wrapper = mount(BaseButton, {
      slots: {
        default: 'Slot content'
      }
    })
    expect(wrapper.text()).toContain('Slot content')
  })

  it('emits click event when clicked', async () => {
    const wrapper = mount(BaseButton)
    
    await wrapper.find('button').trigger('click')
    
    expect(wrapper.emitted('click')).toBeTruthy()
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('shows loading state', () => {
    const wrapper = mount(BaseButton, {
      props: { loading: true }
    })
    
    expect(wrapper.find('.loading-spinner').exists()).toBe(true)
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('is disabled when disabled prop is true', () => {
    const wrapper = mount(BaseButton, {
      props: { disabled: true }
    })
    
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('does not emit click when disabled', async () => {
    const wrapper = mount(BaseButton, {
      props: { disabled: true }
    })
    
    await wrapper.find('button').trigger('click')
    
    expect(wrapper.emitted('click')).toBeFalsy()
  })

  it('does not emit click when loading', async () => {
    const wrapper = mount(BaseButton, {
      props: { loading: true }
    })
    
    await wrapper.find('button').trigger('click')
    
    expect(wrapper.emitted('click')).toBeFalsy()
  })
})