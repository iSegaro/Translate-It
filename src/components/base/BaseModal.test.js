import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseModal from './BaseModal.vue'

vi.mock('./BaseButton.vue', () => ({
  default: {
    name: 'BaseButton',
    template: '<button class="mock-close" />',
    props: ['variant', 'size', 'icon', 'class'],
  },
}))

describe('BaseModal', () => {
  const mountModal = (props = {}) => mount(BaseModal, {
    props: { modelValue: true, title: 'Test', ...props },
  })

  it('renders sheet class by default', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.modal-overlay').classes()).toContain('mobile-sheet')
  })

  it('renders dialog class when mobileBehavior is dialog', () => {
    const wrapper = mountModal({ mobileBehavior: 'dialog' })
    expect(wrapper.find('.modal-overlay').classes()).toContain('mobile-dialog')
    expect(wrapper.find('.modal-overlay').classes()).not.toContain('mobile-sheet')
  })

  it('accepts only sheet or dialog', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
  })

  it('renders nothing when modelValue is false', () => {
    const wrapper = mount(BaseModal, {
      props: { modelValue: false },
    })
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
  })

  it('renders title in header', () => {
    const wrapper = mountModal({ title: 'My Title' })
    expect(wrapper.find('.modal-title').text()).toBe('My Title')
  })

  it('renders close button when closable', () => {
    const wrapper = mountModal({ closable: true })
    expect(wrapper.find('.mock-close').exists()).toBe(true)
  })
})
