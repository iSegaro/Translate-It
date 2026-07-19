import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfStatusBanner from './PdfStatusBanner.vue'

describe('PdfStatusBanner', () => {
  it('renders the banner content', () => {
    const wrapper = mount(PdfStatusBanner, {
      props: {
        visible: true,
        variant: 'warning',
        title: 'Partial translation',
        message: 'Partial translation available.'
      }
    })

    expect(wrapper.text()).toContain('Partial translation')
    expect(wrapper.text()).toContain('Partial translation available.')
    expect(wrapper.classes()).toContain('pdf-status-banner--warning')
    expect(wrapper.classes()).not.toContain('pdf-status-banner--expanded')
    expect(wrapper.find('.pdf-status-banner__body').exists()).toBe(false)
  })

  it('expands naturally around optional slotted body content', () => {
    const wrapper = mount(PdfStatusBanner, {
      props: {
        visible: true,
        variant: 'success',
        title: 'Complete',
        message: 'Details available.',
        body: { type: 'detail', payload: { rows: 2 } }
      },
      slots: {
        body: '<div class="notification-detail"><table><tbody><tr><td>Candidate</td><td>39ms</td></tr></tbody></table></div>'
      }
    })

    expect(wrapper.find('.pdf-status-banner__body').exists()).toBe(true)
    expect(wrapper.classes()).toContain('pdf-status-banner--expanded')
    expect(wrapper.find('.notification-detail').text()).toContain('Candidate')
    expect(wrapper.find('.pdf-status-banner').attributes('style') || '').not.toContain('height')
  })

  it('renders no body content for an unknown body type', () => {
    const wrapper = mount(PdfStatusBanner, {
      props: {
        visible: true,
        body: { type: 'unknown', payload: {} }
      }
    })

    expect(wrapper.find('.pdf-status-banner__body').text()).toBe('')
  })

  it('shows dismiss button when dismissible', async () => {
    const wrapper = mount(PdfStatusBanner, {
      props: {
        visible: true,
        dismissible: true,
        variant: 'error',
        title: 'PDF error',
        message: 'Failed to open the PDF file.'
      }
    })

    await wrapper.find('.pdf-status-banner__dismiss').trigger('click')
    expect(wrapper.emitted('dismiss')).toBeTruthy()
    expect(wrapper.find('.pdf-status-banner__body').exists()).toBe(false)
  })

  it('hides itself when not visible', () => {
    const wrapper = mount(PdfStatusBanner, {
      props: {
        visible: false,
        title: 'Hidden',
        message: 'Hidden'
      }
    })

    expect(wrapper.find('.pdf-status-banner').exists()).toBe(false)
  })
})
