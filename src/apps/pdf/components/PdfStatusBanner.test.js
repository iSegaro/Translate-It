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
