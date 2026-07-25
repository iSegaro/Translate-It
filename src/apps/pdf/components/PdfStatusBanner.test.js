import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfStatusBanner from './PdfStatusBanner.vue'

describe('PdfStatusBanner', () => {
  it('renders the body content', () => {
    const wrapper = mount(PdfStatusBanner, {
      props: {
        body: { type: 'region-comparison-results', payload: { rows: [] } }
      },
      slots: {
        body: '<div class="notification-detail">Comparison data</div>'
      }
    })

    expect(wrapper.find('.pdf-status-banner').exists()).toBe(true)
    expect(wrapper.find('.pdf-status-banner__body').exists()).toBe(true)
    expect(wrapper.classes()).toContain('pdf-status-banner--expanded')
    expect(wrapper.find('.notification-detail').text()).toContain('Comparison data')
  })

  it('does not render body section when body is null', () => {
    const wrapper = mount(PdfStatusBanner, {
      props: { body: null }
    })

    expect(wrapper.find('.pdf-status-banner__body').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('pdf-status-banner--expanded')
  })

  it('shows dismiss button when dismissible', async () => {
    const wrapper = mount(PdfStatusBanner, {
      props: {
        body: { type: 'detail', payload: {} },
        dismissible: true
      }
    })

    expect(wrapper.find('.pdf-status-banner__dismiss').exists()).toBe(true)
    await wrapper.find('.pdf-status-banner__dismiss').trigger('click')
    expect(wrapper.emitted('dismiss')).toBeTruthy()
  })

  it('hides dismiss button when not dismissible', () => {
    const wrapper = mount(PdfStatusBanner, {
      props: {
        body: { type: 'detail', payload: {} },
        dismissible: false
      }
    })

    expect(wrapper.find('.pdf-status-banner__dismiss').exists()).toBe(false)
  })
})
