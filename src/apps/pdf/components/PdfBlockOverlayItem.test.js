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

  describe('line-level overlay for multi-line blocks', () => {
    it('renders one PdfLineOverlayItem per source line when structured and line counts match', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 80 },
            lines: [
              { boundingBox: { x: 10, y: 20, width: 200, height: 30 }, text: 'Line 1' },
              { boundingBox: { x: 10, y: 55, width: 200, height: 30 }, text: 'Line 2' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 2, isMultiLine: true, isStructured: true },
            translationState: { status: 'translated', translatedText: 'Translated line 1\nTranslated line 2' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(2)
      expect(lineItems[0].text()).toBe('Translated line 1')
      expect(lineItems[1].text()).toBe('Translated line 2')
    })

    it('falls back to block-level overlay when translated line count mismatches', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 80 },
            lines: [
              { boundingBox: { x: 10, y: 20, width: 200, height: 30 }, text: 'Line 1' },
              { boundingBox: { x: 10, y: 55, width: 200, height: 30 }, text: 'Line 2' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 2, isMultiLine: true, isStructured: true },
            translationState: { status: 'translated', translatedText: 'Only one line of translation' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(0)
      const blockText = wrapper.find('.pdf-block-overlay-item__text')
      expect(blockText.exists()).toBe(true)
      expect(blockText.text()).toBe('Only one line of translation')
    })

    it('single-line paragraph remains unchanged', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 40 },
            lines: [
              { boundingBox: { x: 10, y: 20, width: 200, height: 40 }, text: 'Single line' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 1, isMultiLine: false },
            translationState: { status: 'translated', translatedText: 'Translated single line' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(0)
      const blockText = wrapper.find('.pdf-block-overlay-item__text')
      expect(blockText.exists()).toBe(true)
      expect(blockText.text()).toBe('Translated single line')
    })

    it('RTL line-level overlay applies direction correctly', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 80 },
            lines: [
              { boundingBox: { x: 10, y: 20, width: 200, height: 30 }, text: 'سطر أول' },
              { boundingBox: { x: 10, y: 55, width: 200, height: 30 }, text: 'سطر ثاني' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 2, isMultiLine: true, isStructured: true },
            translationState: { status: 'translated', translatedText: 'سطر أول\nسطر ثاني' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(2)
      expect(lineItems[0].attributes('dir')).toBe('rtl')
      expect(lineItems[1].attributes('dir')).toBe('rtl')
    })

    it('positions each line at its source boundingBox', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 80 },
            lines: [
              { boundingBox: { x: 10, y: 20, width: 200, height: 30 }, text: 'Line 1' },
              { boundingBox: { x: 10, y: 55, width: 200, height: 30 }, text: 'Line 2' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 2, isMultiLine: true, isStructured: true },
            translationState: { status: 'translated', translatedText: 'Line 1\nLine 2' }
          },
          pageMetric: { scale: 2 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      const line1Style = lineItems[0].attributes('style')
      const line2Style = lineItems[1].attributes('style')
      // Lines are relative to block: line1.y(20) - block.y(20) = 0, line2.y(55) - block.y(20) = 35
      expect(line1Style).toContain('top: 0px')
      expect(line2Style).toContain('top: 70px')
    })

    it('converts line coordinates to relative when block has non-zero offset', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 100, y: 200, width: 300, height: 120 },
            lines: [
              { boundingBox: { x: 100, y: 200, width: 300, height: 40 }, text: 'Row 1' },
              { boundingBox: { x: 100, y: 260, width: 300, height: 40 }, text: 'Row 2' },
              { boundingBox: { x: 100, y: 320, width: 300, height: 40 }, text: 'Row 3' }
            ],
            roleMetadata: { fontSize: 14, lineCount: 3, isMultiLine: true, isStructured: true },
            translationState: { status: 'translated', translatedText: 'Translated 1\nTranslated 2\nTranslated 3' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(3)

      // Block container should be at page-absolute position
      const blockEl = wrapper.find('.pdf-block-overlay-item')
      expect(blockEl.attributes('style')).toContain('left: 100px')
      expect(blockEl.attributes('style')).toContain('top: 200px')

      // Lines should be relative: line.y - block.y
      // line1: y=200 - 200 = 0, line2: y=260 - 200 = 60, line3: y=320 - 200 = 120
      const line1Style = lineItems[0].attributes('style')
      const line2Style = lineItems[1].attributes('style')
      const line3Style = lineItems[2].attributes('style')
      expect(line1Style).toContain('left: 0px')
      expect(line1Style).toContain('top: 0px')
      expect(line2Style).toContain('left: 0px')
      expect(line2Style).toContain('top: 60px')
      expect(line3Style).toContain('left: 0px')
      expect(line3Style).toContain('top: 120px')
    })

    it('handles lines with different x offsets relative to block', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 50, y: 100, width: 400, height: 100 },
            lines: [
              { boundingBox: { x: 50, y: 100, width: 200, height: 30 }, text: 'Left col' },
              { boundingBox: { x: 300, y: 100, width: 150, height: 30 }, text: 'Right col' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 2, isMultiLine: true, isStructured: true },
            translationState: { status: 'translated', translatedText: 'Left\nRight' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      const line1Style = lineItems[0].attributes('style')
      const line2Style = lineItems[1].attributes('style')
      // line1.x(50) - block.x(50) = 0, line2.x(300) - block.x(50) = 250
      expect(line1Style).toContain('left: 0px')
      expect(line2Style).toContain('left: 250px')
    })

    it('falls back when lines array is empty', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 40 },
            lines: [],
            roleMetadata: { fontSize: 12 },
            translationState: { status: 'translated', translatedText: 'Hello' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(0)
      expect(wrapper.find('.pdf-block-overlay-item__text').text()).toBe('Hello')
    })

    it('falls back when block has no lines property', () => {
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

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(0)
      expect(wrapper.find('.pdf-block-overlay-item__text').text()).toBe('Hello')
    })

    it('does NOT enable line overlay for multi-line paragraph without isStructured', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 80 },
            lines: [
              { boundingBox: { x: 10, y: 20, width: 200, height: 30 }, text: 'Paragraph line 1' },
              { boundingBox: { x: 10, y: 55, width: 200, height: 30 }, text: 'Paragraph line 2' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 2, isMultiLine: true },
            translationState: { status: 'translated', translatedText: 'Translated para 1\nTranslated para 2' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(0)
      const blockText = wrapper.find('.pdf-block-overlay-item__text')
      expect(blockText.exists()).toBe(true)
    })

    it('enables line overlay when isStructured is true', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 80 },
            lines: [
              { boundingBox: { x: 10, y: 20, width: 200, height: 30 }, text: 'Row 1' },
              { boundingBox: { x: 10, y: 55, width: 200, height: 30 }, text: 'Row 2' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 2, isMultiLine: true, isStructured: true },
            translationState: { status: 'translated', translatedText: 'Row 1\nRow 2' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(2)
    })

    it('does NOT enable line overlay when isStructured is false', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 80 },
            lines: [
              { boundingBox: { x: 10, y: 20, width: 200, height: 30 }, text: 'Row 1' },
              { boundingBox: { x: 10, y: 55, width: 200, height: 30 }, text: 'Row 2' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 2, isMultiLine: true, isStructured: false },
            translationState: { status: 'translated', translatedText: 'Row 1\nRow 2' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(0)
      const blockText = wrapper.find('.pdf-block-overlay-item__text')
      expect(blockText.exists()).toBe(true)
    })
  })
})
