import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PdfOverlayLayer from './PdfOverlayLayer.vue'

describe('PdfOverlayLayer', () => {
  it('renders nothing when not visible', () => {
    const wrapper = mount(PdfOverlayLayer, {
      props: {
        blocks: [
          {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 100, height: 30 },
            translationState: { status: 'translated', translatedText: 'Hello' }
          }
        ],
        pageMetric: { scale: 1 },
        visible: false
      }
    })

    expect(wrapper.find('.pdf-overlay-layer').exists()).toBe(false)
  })

  it('renders nothing when no translated blocks', () => {
    const wrapper = mount(PdfOverlayLayer, {
      props: {
        blocks: [
          {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 100, height: 30 },
            translationState: { status: 'loading', translatedText: '' }
          }
        ],
        pageMetric: { scale: 1 },
        visible: true
      }
    })

    expect(wrapper.find('.pdf-overlay-layer').exists()).toBe(false)
  })

  it('renders overlay items for translated blocks', () => {
    const wrapper = mount(PdfOverlayLayer, {
      props: {
        blocks: [
          {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 100, height: 30 },
            translationState: { status: 'translated', translatedText: 'Hello' }
          },
          {
            id: 'block-2',
            boundingBox: { x: 10, y: 60, width: 100, height: 30 },
            translationState: { status: 'translated', translatedText: 'World' }
          }
        ],
        pageMetric: { scale: 1 },
        visible: true
      }
    })

    expect(wrapper.find('.pdf-overlay-layer').exists()).toBe(true)
    expect(wrapper.findAll('.pdf-block-overlay-item').length).toBe(2)
  })

  it('filters out error blocks', () => {
    const wrapper = mount(PdfOverlayLayer, {
      props: {
        blocks: [
          {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 100, height: 30 },
            translationState: { status: 'error', translatedText: '' }
          },
          {
            id: 'block-2',
            boundingBox: { x: 10, y: 60, width: 100, height: 30 },
            translationState: { status: 'translated', translatedText: 'World' }
          }
        ],
        pageMetric: { scale: 1 },
        visible: true
      }
    })

    expect(wrapper.findAll('.pdf-block-overlay-item').length).toBe(1)
  })
})
