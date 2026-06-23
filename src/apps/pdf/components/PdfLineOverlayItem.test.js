import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PdfLineOverlayItem from './PdfLineOverlayItem.vue'

describe('PdfLineOverlayItem', () => {
  it('renders line text', () => {
    const wrapper = mount(PdfLineOverlayItem, {
      props: {
        lineText: 'Line Content',
        boundingBox: { x: 0, y: 0, width: 200, height: 20 },
        scale: 1,
        fontSize: 12
      }
    })

    expect(wrapper.text()).toBe('Line Content')
  })

  it('applies correct positioning from boundingBox', () => {
    const wrapper = mount(PdfLineOverlayItem, {
      props: {
        lineText: 'Test',
        boundingBox: { x: 10, y: 20, width: 150, height: 18 },
        scale: 1,
        fontSize: 10
      }
    })

    const el = wrapper.find('.pdf-line-overlay-item')
    const style = el.attributes('style')
    expect(style).toContain('left: 10px')
    expect(style).toContain('top: 20px')
    expect(style).toContain('width: 150px')
    expect(style).toContain('height: 18px')
  })

  it('scales positions by scale factor', () => {
    const wrapper = mount(PdfLineOverlayItem, {
      props: {
        lineText: 'Test',
        boundingBox: { x: 10, y: 20, width: 150, height: 18 },
        scale: 3,
        fontSize: 10
      }
    })

    const el = wrapper.find('.pdf-line-overlay-item')
    const style = el.attributes('style')
    expect(style).toContain('left: 30px')
    expect(style).toContain('top: 60px')
    expect(style).toContain('width: 450px')
    expect(style).toContain('height: 54px')
  })

  it('detects RTL text', () => {
    const wrapper = mount(PdfLineOverlayItem, {
      props: {
        lineText: 'سطر اختبار',
        boundingBox: { x: 0, y: 0, width: 200, height: 20 },
        scale: 1
      }
    })

    expect(wrapper.find('.pdf-line-overlay-item').attributes('dir')).toBe('rtl')
  })

  it('detects LTR text', () => {
    const wrapper = mount(PdfLineOverlayItem, {
      props: {
        lineText: 'Test line',
        boundingBox: { x: 0, y: 0, width: 200, height: 20 },
        scale: 1
      }
    })

    expect(wrapper.find('.pdf-line-overlay-item').attributes('dir')).toBe('ltr')
  })

  it('applies font-family from prop', () => {
    const wrapper = mount(PdfLineOverlayItem, {
      props: {
        lineText: 'Test',
        boundingBox: { x: 0, y: 0, width: 200, height: 20 },
        scale: 1,
        fontSize: 12,
        fontFamily: 'Courier'
      }
    })

    const el = wrapper.find('.pdf-line-overlay-item')
    expect(el.attributes('style')).toContain('Courier')
  })

  it('uses shared typography for default values', () => {
    const wrapper = mount(PdfLineOverlayItem, {
      props: {
        lineText: 'Test',
        boundingBox: { x: 0, y: 0, width: 200, height: 20 },
        scale: 1,
        fontSize: 12
      }
    })

    const el = wrapper.find('.pdf-line-overlay-item')
    const style = el.attributes('style')
    expect(style).toContain('font-size: 12px')
    expect(style).toContain('line-height: 1')
    expect(style).toContain('background: rgb(255, 255, 255)')
    expect(style).toContain('overflow: hidden')
  })

  it('applies ascent/descent for line-height', () => {
    const wrapper = mount(PdfLineOverlayItem, {
      props: {
        lineText: 'Test',
        boundingBox: { x: 0, y: 0, width: 200, height: 20 },
        scale: 1,
        fontSize: 12,
        ascent: 0.75,
        descent: -0.25
      }
    })

    const el = wrapper.find('.pdf-line-overlay-item')
    expect(el.attributes('style')).toContain('line-height: 1')
  })

  it('reduces font size when text overflows via mocked getBoundingClientRect', async () => {
    const callCount = { value: 0 }
    const originalGetBCR = Element.prototype.getBoundingClientRect

    Element.prototype.getBoundingClientRect = function () {
      callCount.value++
      if (callCount.value <= 1) {
        return { width: 400, height: 50, top: 0, left: 0, bottom: 50, right: 400 }
      }
      return { width: 190, height: 18, top: 0, left: 0, bottom: 18, right: 190 }
    }

    try {
      const wrapper = mount(PdfLineOverlayItem, {
        props: {
          lineText: 'Very long line that overflows',
          boundingBox: { x: 0, y: 0, width: 180, height: 16 },
          scale: 1,
          fontSize: 12
        }
      })

      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      const style = wrapper.find('.pdf-line-overlay-item').attributes('style')
      const fontSizeMatch = style.match(/font-size:\s*([\d.]+)px/)
      expect(fontSizeMatch).not.toBeNull()
      const fontSize = parseFloat(fontSizeMatch[1])
      expect(fontSize).toBeLessThan(12)
      expect(fontSize).toBeGreaterThanOrEqual(7.2)
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBCR
    }
  })
})
