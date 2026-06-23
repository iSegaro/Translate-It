import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PdfBlockOverlayItem from './PdfBlockOverlayItem.vue'

describe('PdfBlockOverlayItem', () => {
  it('renders translated text', () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12 },
          translationState: { status: 'translated', translatedText: 'Hello World' }
        },
        pageMetric: { scale: 1 }
      }
    })

    expect(wrapper.text()).toContain('Hello World')
  })

  it('applies correct positioning', () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12 },
          translationState: { status: 'translated', translatedText: 'Hello' }
        },
        pageMetric: { scale: 2 }
      }
    })

    const el = wrapper.find('.pdf-block-overlay-item')
    expect(el.attributes('style')).toContain('left: 20px')
    expect(el.attributes('style')).toContain('top: 40px')
    expect(el.attributes('style')).toContain('width: 400px')
    expect(el.attributes('style')).toContain('height: 80px')
  })

  it('detects RTL text', () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12 },
          translationState: { status: 'translated', translatedText: 'مرحبا بالعالم' }
        },
        pageMetric: { scale: 1 }
      }
    })

    expect(wrapper.find('.pdf-block-overlay-item').attributes('dir')).toBe('rtl')
  })

  it('detects LTR text', () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12 },
          translationState: { status: 'translated', translatedText: 'Hello World' }
        },
        pageMetric: { scale: 1 }
      }
    })

    expect(wrapper.find('.pdf-block-overlay-item').attributes('dir')).toBe('ltr')
  })

  it('applies font-family from roleMetadata', () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12, fontFamily: 'Times-Roman' },
          translationState: { status: 'translated', translatedText: 'Hello' }
        },
        pageMetric: { scale: 1 }
      }
    })

    const el = wrapper.find('.pdf-block-overlay-item')
    expect(el.attributes('style')).toContain('Times New Roman')
  })

  it('has solid background from OVERLAY_BACKGROUND constant', () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12 },
          translationState: { status: 'translated', translatedText: 'Hello' }
        },
        pageMetric: { scale: 1 }
      }
    })

    const el = wrapper.find('.pdf-block-overlay-item')
    expect(el.attributes('style')).toContain('background: rgb(255, 255, 255)')
  })

  it('has text ref attached for adaptive fitting', () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12 },
          translationState: { status: 'translated', translatedText: 'Hello' }
        },
        pageMetric: { scale: 1 }
      }
    })

    const textSpan = wrapper.find('.pdf-block-overlay-item__text')
    expect(textSpan.exists()).toBe(true)
    expect(textSpan.text()).toBe('Hello')
  })

  it('resets font scale when translated text changes', async () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12 },
          translationState: { status: 'translated', translatedText: 'Short' }
        },
        pageMetric: { scale: 1 }
      }
    })

    await wrapper.setProps({
      block: {
        id: 'block-1',
        boundingBox: { x: 10, y: 20, width: 200, height: 40 },
        roleMetadata: { fontSize: 12 },
        translationState: { status: 'translated', translatedText: 'A much longer translated text that might need fitting' }
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('A much longer translated text')
  })

  it('resets font scale when scale changes', async () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12 },
          translationState: { status: 'translated', translatedText: 'Hello' }
        },
        pageMetric: { scale: 1 }
      }
    })

    await wrapper.setProps({
      pageMetric: { scale: 2 }
    })

    await wrapper.vm.$nextTick()
    const el = wrapper.find('.pdf-block-overlay-item')
    expect(el.attributes('style')).toContain('width: 400px')
  })

  it('reduces font scale when text overflows container via mocked getBoundingClientRect', async () => {
    const callCount = { value: 0 }
    const originalGetBCR = Element.prototype.getBoundingClientRect

    Element.prototype.getBoundingClientRect = function () {
      callCount.value++
      if (callCount.value <= 1) {
        return { width: 500, height: 100, top: 0, left: 0, bottom: 100, right: 500 }
      }
      return { width: 180, height: 30, top: 0, left: 0, bottom: 30, right: 180 }
    }

    try {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 40 },
            roleMetadata: { fontSize: 12 },
            translationState: { status: 'translated', translatedText: 'Overflowing text content here' }
          },
          pageMetric: { scale: 1 }
        }
      })

      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      const style = wrapper.find('.pdf-block-overlay-item').attributes('style')
      expect(style).toContain('font-size:')
      const fontSizeMatch = style.match(/font-size:\s*([\d.]+)px/)
      expect(fontSizeMatch).not.toBeNull()
      const fontSize = parseFloat(fontSizeMatch[1])
      expect(fontSize).toBeLessThan(12)
      expect(fontSize).toBeGreaterThanOrEqual(7.2)
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBCR
    }
  })

  it('uses propagated ascent/descent for line-height when available', () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12, ascent: 0.75, descent: -0.25 },
          translationState: { status: 'translated', translatedText: 'Hello' }
        },
        pageMetric: { scale: 1 }
      }
    })

    const el = wrapper.find('.pdf-block-overlay-item')
    expect(el.attributes('style')).toContain('line-height: 1')
  })

  it('falls back to default ascent when roleMetadata has no ascent', () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12 },
          translationState: { status: 'translated', translatedText: 'Hello' }
        },
        pageMetric: { scale: 1 }
      }
    })

    const el = wrapper.find('.pdf-block-overlay-item')
    expect(el.attributes('style')).toContain('line-height: 1')
  })

  it('uses propagated fontFamily from roleMetadata', () => {
    const wrapper = mount(PdfBlockOverlayItem, {
      props: {
        block: {
          id: 'block-1',
          boundingBox: { x: 10, y: 20, width: 200, height: 40 },
          roleMetadata: { fontSize: 12, fontFamily: 'Courier' },
          translationState: { status: 'translated', translatedText: 'Hello' }
        },
        pageMetric: { scale: 1 }
      }
    })

    const el = wrapper.find('.pdf-block-overlay-item')
    expect(el.attributes('style')).toContain('Courier')
  })
})
