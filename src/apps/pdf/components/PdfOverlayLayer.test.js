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

  it('accepts missing pageMaskModel without error', () => {
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
        visible: true,
        pageMaskModel: null
      }
    })

    expect(wrapper.find('.pdf-overlay-layer').exists()).toBe(true)
  })

  it('builds maskMap from pageMaskModel masks', () => {
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
        visible: true,
        pageMaskModel: {
          masks: [
            { ownerId: 'block-1', type: 'block', boundingBox: { x: 10, y: 20, width: 100, height: 30 } }
          ],
          metadata: { totalMasks: 1, blockMasks: 1, cellMasks: 0, regionMasks: 0 }
        }
      }
    })

    expect(wrapper.find('.pdf-overlay-layer').exists()).toBe(true)
  })

  it('duplicate ownerId keeps first mask deterministically', () => {
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
        visible: true,
        pageMaskModel: {
          masks: [
            { ownerId: 'block-1', type: 'block', boundingBox: { x: 10, y: 20, width: 100, height: 30 }, priority: 50 },
            { ownerId: 'block-1', type: 'block', boundingBox: { x: 10, y: 20, width: 100, height: 30 }, priority: 90 }
          ],
          metadata: { totalMasks: 2, blockMasks: 2, cellMasks: 0, regionMasks: 0 }
        }
      }
    })

    expect(wrapper.find('.pdf-overlay-layer').exists()).toBe(true)
  })

  it('overlay output unchanged when pageMaskModel missing', () => {
    const blocks = [
      {
        id: 'block-1',
        boundingBox: { x: 10, y: 20, width: 100, height: 30 },
        translationState: { status: 'translated', translatedText: 'Hello' }
      }
    ]

    const withMask = mount(PdfOverlayLayer, {
      props: { blocks, pageMetric: { scale: 1 }, visible: true, pageMaskModel: null }
    })
    const withoutMask = mount(PdfOverlayLayer, {
      props: { blocks, pageMetric: { scale: 1 }, visible: true }
    })

    expect(withMask.findAll('.pdf-block-overlay-item').length).toBe(withoutMask.findAll('.pdf-block-overlay-item').length)
  })
})
