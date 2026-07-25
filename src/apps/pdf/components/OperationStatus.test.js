import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OperationStatus from './OperationStatus.vue'

describe('OperationStatus', () => {
  it('renders with title', () => {
    const wrapper = mount(OperationStatus, {
      props: { title: 'Translating...', cancellable: false }
    })
    expect(wrapper.find('.operation-status').exists()).toBe(true)
    expect(wrapper.find('.operation-status__title').text()).toBe('Translating...')

    wrapper.unmount()
  })

  it('renders empty title', () => {
    const wrapper = mount(OperationStatus, {
      props: { title: '', cancellable: false }
    })
    expect(wrapper.find('.operation-status__title').text()).toBe('')

    wrapper.unmount()
  })

  it('shows cancel button when cancellable', () => {
    const wrapper = mount(OperationStatus, {
      props: { title: 'Processing', cancellable: true }
    })
    expect(wrapper.find('.operation-status__cancel').exists()).toBe(true)

    wrapper.unmount()
  })

  it('hides cancel button when not cancellable', () => {
    const wrapper = mount(OperationStatus, {
      props: { title: 'Processing', cancellable: false }
    })
    expect(wrapper.find('.operation-status__cancel').exists()).toBe(false)

    wrapper.unmount()
  })

  it('emits cancel when cancel button clicked', async () => {
    const wrapper = mount(OperationStatus, {
      props: { title: 'Processing', cancellable: true }
    })
    await wrapper.find('.operation-status__cancel').trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()

    wrapper.unmount()
  })

  it('has role=status and aria-live=polite', () => {
    const wrapper = mount(OperationStatus, {
      props: { title: 'Processing', cancellable: false }
    })
    const el = wrapper.find('.operation-status')
    expect(el.attributes('role')).toBe('status')
    expect(el.attributes('aria-live')).toBe('polite')

    wrapper.unmount()
  })

  it('adds aria-label on cancel button', () => {
    const wrapper = mount(OperationStatus, {
      props: { title: 'Processing', cancellable: true }
    })
    expect(wrapper.find('.operation-status__cancel').attributes('aria-label')).toBe('Cancel operation')

    wrapper.unmount()
  })
})
