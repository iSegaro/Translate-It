import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfProgressBar from './PdfProgressBar.vue'

function buildOperation(overrides = {}) {
  return {
    id: null,
    title: 'Processing...',
    running: true,
    indeterminate: true,
    progress: null,
    cancellable: false,
    onCancel: null,
    ...overrides
  }
}

describe('PdfProgressBar', () => {
  it('renders when running and hides when idle', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ running: true }) }
    })
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(true)

    wrapper.unmount()
  })

  it('is hidden when operation is not running', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ running: false }) }
    })
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(false)

    wrapper.unmount()
  })

  it('shows title label', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ title: 'Translating...' }) }
    })
    expect(wrapper.find('.pdf-progress-bar__label').text()).toBe('Translating...')

    wrapper.unmount()
  })

  it('applies indeterminate class when indeterminate', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ indeterminate: true }) }
    })
    expect(wrapper.find('.pdf-progress-bar__fill--indeterminate').exists()).toBe(true)

    wrapper.unmount()
  })

  it('shows determinate progress width', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ indeterminate: false, progress: 75 }) }
    })
    expect(wrapper.find('.pdf-progress-bar__fill--indeterminate').exists()).toBe(false)
    expect(wrapper.find('.pdf-progress-bar__fill').attributes('style')).toContain('width: 75%')

    wrapper.unmount()
  })

  it('shows cancel button when cancellable', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ cancellable: true }) }
    })
    expect(wrapper.find('.pdf-progress-bar__cancel').exists()).toBe(true)

    wrapper.unmount()
  })

  it('hides cancel button when not cancellable', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ cancellable: false }) }
    })
    expect(wrapper.find('.pdf-progress-bar__cancel').exists()).toBe(false)

    wrapper.unmount()
  })

  it('emits cancel when cancel button clicked', async () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ cancellable: true }) }
    })
    await wrapper.find('.pdf-progress-bar__cancel').trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()

    wrapper.unmount()
  })
})
