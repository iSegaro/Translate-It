import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PdfRegionSelectionOverlay from './PdfRegionSelectionOverlay.vue'

describe('PdfRegionSelectionOverlay', () => {
  it('renders only while active', async () => {
    const wrapper = mount(PdfRegionSelectionOverlay)

    expect(wrapper.find('.pdf-region-selection-overlay').exists()).toBe(false)

    await wrapper.setProps({ active: true })
    expect(wrapper.find('.pdf-region-selection-overlay').exists()).toBe(true)
  })

  it('renders only the supplied visual rectangle', () => {
    const wrapper = mount(PdfRegionSelectionOverlay, {
      props: {
        active: true,
        rect: { x: 12.5, y: 20.25, width: 40.75, height: 30.5 }
      }
    })

    expect(wrapper.find('.pdf-region-selection-overlay__rect').attributes('style')).toContain('left: 12.5px')
    expect(wrapper.find('.pdf-region-selection-overlay__rect').attributes('style')).toContain('height: 30.5px')
  })

  it('renders without emitting interaction events', async () => {
    const wrapper = mount(PdfRegionSelectionOverlay, { props: { active: true } })

    expect(wrapper.find('.pdf-region-selection-overlay').exists()).toBe(true)
    expect(wrapper.emitted()).toEqual({})
  })
})
