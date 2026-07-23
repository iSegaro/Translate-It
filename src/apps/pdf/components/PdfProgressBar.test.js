import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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
  it('renders when running and stays visible during linger', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ running: true }) }
    })
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(true)

    await wrapper.setProps({ operation: buildOperation({ running: false }) })
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(false)

    wrapper.unmount()
    vi.useRealTimers()
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

  it('sets aria-valuenow and min/max for determinate progress', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ indeterminate: false, progress: 42 }) }
    })
    const bar = wrapper.find('.pdf-progress-bar')
    expect(bar.attributes('aria-valuenow')).toBe('42')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('100')

    wrapper.unmount()
  })

  it('omits aria-valuenow when indeterminate', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ indeterminate: true }) }
    })
    const bar = wrapper.find('.pdf-progress-bar')
    expect(bar.attributes('aria-valuenow')).toBeUndefined()
    expect(bar.attributes('aria-valuemin')).toBeUndefined()
    expect(bar.attributes('aria-valuemax')).toBeUndefined()

    wrapper.unmount()
  })

  it('uses title as aria-label', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ title: 'Translating pages...' }) }
    })
    expect(wrapper.find('.pdf-progress-bar').attributes('aria-label')).toBe('Translating pages...')

    wrapper.unmount()
  })

  it('sets fallback aria-label when no title', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ title: '' }) }
    })
    expect(wrapper.find('.pdf-progress-bar').attributes('aria-label')).toBe('Operation in progress')

    wrapper.unmount()
  })

  it('cancels pending hide timer on restart during linger', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ running: true }) }
    })
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(true)

    await wrapper.setProps({ operation: buildOperation({ running: false }) })
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(100)
    await wrapper.setProps({ operation: buildOperation({ running: true, title: 'Restarted' }) })
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(true)
    expect(wrapper.find('.pdf-progress-bar__label').text()).toBe('Restarted')

    await vi.advanceTimersByTimeAsync(150)
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(true)

    await wrapper.setProps({ operation: buildOperation({ running: false }) })
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(200)
    await flushPromises()
    expect(wrapper.find('.pdf-progress-bar').exists()).toBe(false)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('adds aria-label on cancel button', () => {
    const wrapper = mount(PdfProgressBar, {
      props: { operation: buildOperation({ cancellable: true }) }
    })
    expect(wrapper.find('.pdf-progress-bar__cancel').attributes('aria-label')).toBe('Cancel operation')

    wrapper.unmount()
  })
})
