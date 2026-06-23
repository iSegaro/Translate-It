import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PdfCellOverlayItem from './PdfCellOverlayItem.vue'

describe('PdfCellOverlayItem', () => {
  it('renders cell text', () => {
    const wrapper = mount(PdfCellOverlayItem, {
      props: {
        cellText: 'Cell Value',
        item: { x: 0, y: 0, width: 100, height: 20 },
        scale: 1,
        fontSize: 12
      }
    })

    expect(wrapper.text()).toBe('Cell Value')
  })

  it('applies correct positioning from item geometry', () => {
    const wrapper = mount(PdfCellOverlayItem, {
      props: {
        cellText: 'Test',
        item: { x: 50, y: 100, width: 120, height: 18 },
        scale: 1,
        fontSize: 10
      }
    })

    const el = wrapper.find('.pdf-cell-overlay-item')
    const style = el.attributes('style')
    expect(style).toContain('left: 50px')
    expect(style).toContain('top: 100px')
    expect(style).toContain('width: 120px')
    expect(style).toContain('height: 18px')
  })

  it('scales positions by scale factor', () => {
    const wrapper = mount(PdfCellOverlayItem, {
      props: {
        cellText: 'Test',
        item: { x: 50, y: 100, width: 120, height: 18 },
        scale: 2,
        fontSize: 10
      }
    })

    const el = wrapper.find('.pdf-cell-overlay-item')
    const style = el.attributes('style')
    expect(style).toContain('left: 100px')
    expect(style).toContain('top: 200px')
    expect(style).toContain('width: 240px')
    expect(style).toContain('height: 36px')
  })

  it('detects RTL text', () => {
    const wrapper = mount(PdfCellOverlayItem, {
      props: {
        cellText: 'مرحبا',
        item: { x: 0, y: 0, width: 100, height: 20 },
        scale: 1
      }
    })

    expect(wrapper.find('.pdf-cell-overlay-item').attributes('dir')).toBe('rtl')
  })

  it('detects LTR text', () => {
    const wrapper = mount(PdfCellOverlayItem, {
      props: {
        cellText: 'Hello',
        item: { x: 0, y: 0, width: 100, height: 20 },
        scale: 1
      }
    })

    expect(wrapper.find('.pdf-cell-overlay-item').attributes('dir')).toBe('ltr')
  })

  it('applies font-family from prop', () => {
    const wrapper = mount(PdfCellOverlayItem, {
      props: {
        cellText: 'Test',
        item: { x: 0, y: 0, width: 100, height: 20 },
        scale: 1,
        fontSize: 12,
        fontFamily: 'Courier'
      }
    })

    const el = wrapper.find('.pdf-cell-overlay-item')
    expect(el.attributes('style')).toContain('Courier')
  })

  it('uses shared typography for default values', () => {
    const wrapper = mount(PdfCellOverlayItem, {
      props: {
        cellText: 'Test',
        item: { x: 0, y: 0, width: 100, height: 20 },
        scale: 1,
        fontSize: 12
      }
    })

    const el = wrapper.find('.pdf-cell-overlay-item')
    const style = el.attributes('style')
    expect(style).toContain('font-size: 12px')
    expect(style).toContain('line-height: 1')
    expect(style).toContain('background: rgb(255, 255, 255)')
    expect(style).toContain('overflow: hidden')
    expect(style).toContain('box-sizing: border-box')
  })

  it('applies ascent/descent for line-height', () => {
    const wrapper = mount(PdfCellOverlayItem, {
      props: {
        cellText: 'Test',
        item: { x: 0, y: 0, width: 100, height: 20 },
        scale: 1,
        fontSize: 12,
        ascent: 0.75,
        descent: -0.25
      }
    })

    const el = wrapper.find('.pdf-cell-overlay-item')
    expect(el.attributes('style')).toContain('line-height: 1')
  })

  it('reduces font size when text overflows via mocked getBoundingClientRect', async () => {
    const callCount = { value: 0 }
    const originalGetBCR = Element.prototype.getBoundingClientRect

    Element.prototype.getBoundingClientRect = function () {
      callCount.value++
      if (callCount.value <= 1) {
        return { width: 200, height: 50, top: 0, left: 0, bottom: 50, right: 200 }
      }
      return { width: 90, height: 18, top: 0, left: 0, bottom: 18, right: 90 }
    }

    try {
      const wrapper = mount(PdfCellOverlayItem, {
        props: {
          cellText: 'Long text that overflows the cell',
          item: { x: 0, y: 0, width: 80, height: 16 },
          scale: 1,
          fontSize: 12
        }
      })

      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      const style = wrapper.find('.pdf-cell-overlay-item').attributes('style')
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
