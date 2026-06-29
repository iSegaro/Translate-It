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
        message: 'Partial translation available.',
        detail: 'Some blocks are still missing.'
      }
    })

    expect(wrapper.text()).toContain('Partial translation')
    expect(wrapper.text()).toContain('Partial translation available.')
    expect(wrapper.text()).toContain('Some blocks are still missing.')
    expect(wrapper.classes()).toContain('pdf-status-banner--warning')
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
