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

  describe('cell-level overlay for structured blocks with translatedCells', () => {
    it('prefers structured cell bounding boxes when available', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-structured',
            boundingBox: { x: 100, y: 200, width: 400, height: 80 },
            lines: [
              {
                boundingBox: { x: 100, y: 200, width: 400, height: 30 },
                items: [
                  { x: 100, y: 200, width: 150, height: 30 },
                  { x: 260, y: 200, width: 150, height: 30 }
                ],
                text: 'Header A  Header B'
              }
            ],
            roleMetadata: { fontSize: 12, lineCount: 1, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'هدر الف هدر ب',
              translatedCells: [
                {
                  lineIndex: 0,
                  cells: ['هدر الف', 'هدر ب'],
                  structuredCells: [
                    { boundingBox: { x: 120, y: 210, width: 120, height: 18 }, colSpan: 2, rowSpan: 1, spanType: 'merged', role: 'header' },
                    { boundingBox: { x: 260, y: 210, width: 150, height: 18 }, colSpan: 1, rowSpan: 1, spanType: 'none', role: 'header' }
                  ]
                }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(2)

      const firstCellStyle = cellItems[0].attributes('style')
      expect(firstCellStyle).toContain('left: 20px')
      expect(firstCellStyle).toContain('top: 10px')
      expect(firstCellStyle).toContain('width: 120px')
      expect(firstCellStyle).toContain('height: 18px')
    })

    it('renders PdfCellOverlayItem components when translatedCells has multi-cell lines', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 100, y: 200, width: 400, height: 80 },
            lines: [
              { boundingBox: { x: 100, y: 200, width: 400, height: 30 }, items: [{ x: 100, y: 200, width: 150, height: 30 }, { x: 260, y: 200, width: 150, height: 30 }], text: 'Header A  Header B' },
              { boundingBox: { x: 100, y: 240, width: 400, height: 30 }, items: [{ x: 100, y: 240, width: 150, height: 30 }, { x: 260, y: 240, width: 150, height: 30 }], text: 'Value 1  Value 2' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 2, isMultiLine: true, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'هدر الف\nمقدار ۱ مقدار ۲',
              translatedCells: [
                { lineIndex: 0, cells: ['هدر الف'] },
                { lineIndex: 1, cells: ['مقدار ۱', 'مقدار ۲'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(3)
      expect(cellItems[0].text()).toBe('هدر الف')
      expect(cellItems[1].text()).toBe('مقدار ۱')
      expect(cellItems[2].text()).toBe('مقدار ۲')
    })

    it('preserves structured colSpan metadata in cell width resolution', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-span',
            boundingBox: { x: 100, y: 200, width: 400, height: 80 },
            lines: [
              {
                boundingBox: { x: 100, y: 200, width: 400, height: 30 },
                items: [
                  { x: 100, y: 200, width: 120, height: 30 },
                  { x: 230, y: 200, width: 120, height: 30 }
                ],
                text: 'Metric  Value'
              }
            ],
            roleMetadata: { fontSize: 12, lineCount: 1, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'مقدار ارزش',
              translatedCells: [
                {
                  lineIndex: 0,
                  cells: ['مقدار', 'ارزش'],
                  structuredCells: [
                    { colSpan: 2, rowSpan: 1, spanType: 'merged', role: 'value' },
                    { colSpan: 1, rowSpan: 1, spanType: 'none', role: 'value' }
                  ]
                }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(2)

      const firstCellStyle = cellItems[0].attributes('style')
      expect(firstCellStyle).toContain('width: 248px')
    })

    it('positions cells using inferred column widths from neighbor positions', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 100, y: 200, width: 400, height: 80 },
            lines: [
              {
                boundingBox: { x: 100, y: 200, width: 400, height: 30 },
                items: [{ x: 100, y: 200, width: 180, height: 30 }, { x: 290, y: 200, width: 120, height: 30 }],
                text: 'Col A  Col B'
              },
              {
                boundingBox: { x: 100, y: 240, width: 400, height: 30 },
                items: [{ x: 100, y: 240, width: 180, height: 30 }, { x: 290, y: 240, width: 120, height: 30 }],
                text: 'Val 1  Val 2'
              }
            ],
            roleMetadata: { fontSize: 10, lineCount: 2, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'العمود أ\nمقدار',
              translatedCells: [
                { lineIndex: 0, cells: ['العمود أ', 'العمود ب'] },
                { lineIndex: 1, cells: ['مقدار'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(3)

      const cell1Style = cellItems[0].attributes('style')
      expect(cell1Style).toContain('left: 0px')
      expect(cell1Style).toContain('top: 0px')
      expect(cell1Style).toContain('width: 184px')

      const cell2Style = cellItems[1].attributes('style')
      expect(cell2Style).toContain('left: 190px')
      expect(cell2Style).toContain('top: 0px')
      expect(cell2Style).toContain('width: 210px')
    })

    it('last cell extends to line right edge', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 0, y: 0, width: 500, height: 80 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 500, height: 30 },
                items: [{ x: 0, y: 0, width: 100, height: 30 }, { x: 150, y: 0, width: 100, height: 30 }, { x: 300, y: 0, width: 100, height: 30 }],
                text: 'A  B  C'
              },
              {
                boundingBox: { x: 0, y: 35, width: 500, height: 30 },
                items: [{ x: 0, y: 35, width: 100, height: 30 }, { x: 150, y: 35, width: 100, height: 30 }, { x: 300, y: 35, width: 100, height: 30 }],
                text: 'D  E  F'
              }
            ],
            roleMetadata: { fontSize: 10, lineCount: 2, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'X\nY',
              translatedCells: [
                { lineIndex: 0, cells: ['X', 'Y', 'Z'] },
                { lineIndex: 1, cells: ['P', 'Q', 'R'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(6)

      const cell3Style = cellItems[2].attributes('style')
      expect(cell3Style).toContain('width: 200px')

      const cell6Style = cellItems[5].attributes('style')
      expect(cell6Style).toContain('width: 200px')
    })

    it('gaps between columns are included in preceding cell width', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 0, y: 0, width: 400, height: 80 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 400, height: 30 },
                items: [{ x: 10, y: 0, width: 80, height: 30 }, { x: 200, y: 0, width: 100, height: 30 }],
                text: 'Wide  gap'
              },
              {
                boundingBox: { x: 0, y: 35, width: 400, height: 30 },
                items: [{ x: 10, y: 35, width: 80, height: 30 }, { x: 200, y: 35, width: 100, height: 30 }],
                text: 'Col 1  Col 2'
              }
            ],
            roleMetadata: { fontSize: 10, lineCount: 2, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'X\nY',
              translatedCells: [
                { lineIndex: 0, cells: ['Left', 'Right'] },
                { lineIndex: 1, cells: ['A', 'B'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(4)

      const cell1Style = cellItems[0].attributes('style')
      expect(cell1Style).toContain('width: 124px')

      const cell2Style = cellItems[1].attributes('style')
      expect(cell2Style).toContain('width: 200px')
    })

    it('single-cell line extends to line right edge', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 0, y: 0, width: 400, height: 90 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 400, height: 25 },
                items: [{ x: 20, y: 0, width: 50, height: 25 }, { x: 150, y: 0, width: 50, height: 25 }],
                text: 'Multi cells'
              },
              {
                boundingBox: { x: 0, y: 30, width: 400, height: 25 },
                items: [{ x: 20, y: 30, width: 50, height: 25 }],
                text: 'Single item'
              },
              {
                boundingBox: { x: 0, y: 60, width: 400, height: 25 },
                items: [{ x: 20, y: 60, width: 50, height: 25 }, { x: 150, y: 60, width: 50, height: 25 }],
                text: 'More cells'
              }
            ],
            roleMetadata: { fontSize: 10, lineCount: 3, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'A\nB\nC',
              translatedCells: [
                { lineIndex: 0, cells: ['X', 'Y'] },
                { lineIndex: 1, cells: ['Z'] },
                { lineIndex: 2, cells: ['P', 'Q'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(5)

      const cell2Style = cellItems[2].attributes('style')
      expect(cell2Style).toContain('width: 380px')
    })

    it('falls back to item.width when inferred width is invalid', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 0, y: 0, width: 300, height: 60 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 300, height: 25 },
                items: [{ x: 100, y: 0, width: 80, height: 25 }, { x: 80, y: 0, width: 80, height: 25 }],
                text: 'A  B'
              },
              {
                boundingBox: { x: 0, y: 30, width: 300, height: 25 },
                items: [{ x: 100, y: 30, width: 80, height: 25 }, { x: 80, y: 30, width: 80, height: 25 }],
                text: 'C  D'
              }
            ],
            roleMetadata: { fontSize: 10, lineCount: 2, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'X\nY',
              translatedCells: [
                { lineIndex: 0, cells: ['X', 'Y'] },
                { lineIndex: 1, cells: ['X', 'Y'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(4)

      const cell1Style = cellItems[0].attributes('style')
      expect(cell1Style).toContain('width: 80px')
    })

    it('detects RTL direction per cell', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 0, y: 0, width: 300, height: 60 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 300, height: 25 },
                items: [{ x: 0, y: 0, width: 150, height: 25 }, { x: 160, y: 0, width: 130, height: 25 }],
                text: 'A  B'
              },
              {
                boundingBox: { x: 0, y: 30, width: 300, height: 25 },
                items: [{ x: 0, y: 30, width: 150, height: 25 }, { x: 160, y: 30, width: 130, height: 25 }],
                text: 'C  D'
              }
            ],
            roleMetadata: { fontSize: 10, lineCount: 2, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'مرحبا\nHello',
              translatedCells: [
                { lineIndex: 0, cells: ['مرحبا', 'Hello'] },
                { lineIndex: 1, cells: ['مرحبا', 'Hello'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems[0].attributes('dir')).toBe('rtl')
      expect(cellItems[1].attributes('dir')).toBe('ltr')
    })

    it('falls back to line overlay when translatedCells has no multi-cell lines', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 10, y: 20, width: 200, height: 80 },
            lines: [
              { boundingBox: { x: 10, y: 20, width: 200, height: 30 }, items: [{ x: 10, y: 20, width: 200, height: 30 }], text: 'Row 1' },
              { boundingBox: { x: 10, y: 55, width: 200, height: 30 }, items: [{ x: 10, y: 55, width: 200, height: 30 }], text: 'Row 2' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 2, isMultiLine: true, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'سطر 1\nسطر 2',
              translatedCells: [
                { lineIndex: 0, cells: ['سطر 1'] },
                { lineIndex: 1, cells: ['سطر 2'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(0)
      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(2)
    })

    it('falls back to block overlay when translatedCells is absent', () => {
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
            translationState: {
              status: 'translated',
              translatedText: 'سطر 1\nسطر 2'
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(0)
      const lineItems = wrapper.findAll('.pdf-line-overlay-item')
      expect(lineItems.length).toBe(2)
    })

    it('mixed single and multi cell lines renders all as cell items', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 0, y: 0, width: 400, height: 90 },
            lines: [
              { boundingBox: { x: 0, y: 0, width: 400, height: 30 }, items: [{ x: 0, y: 0, width: 400, height: 30 }], text: 'Single item line' },
              { boundingBox: { x: 0, y: 35, width: 400, height: 30 }, items: [{ x: 0, y: 35, width: 180, height: 30 }, { x: 190, y: 35, width: 120, height: 30 }], text: 'Multi  cells' },
              { boundingBox: { x: 0, y: 70, width: 400, height: 30 }, items: [{ x: 0, y: 70, width: 400, height: 30 }], text: 'Another single' }
            ],
            roleMetadata: { fontSize: 12, lineCount: 3, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'سطر واحد\nستون ۱ ستون ۲\nسطر آخر',
              translatedCells: [
                { lineIndex: 0, cells: ['سطر واحد'] },
                { lineIndex: 1, cells: ['ستون ۱', 'ستون ۲'] },
                { lineIndex: 2, cells: ['سطر آخر'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(4)
      expect(cellItems[0].text()).toBe('سطر واحد')
      expect(cellItems[1].text()).toBe('ستون ۱')
      expect(cellItems[2].text()).toBe('ستون ۲')
      expect(cellItems[3].text()).toBe('سطر آخر')
    })

    it('applies font metadata from roleMetadata to cell items', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'block-1',
            boundingBox: { x: 0, y: 0, width: 300, height: 60 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 300, height: 25 },
                items: [{ x: 0, y: 0, width: 140, height: 25 }, { x: 150, y: 0, width: 140, height: 25 }],
                text: 'A  B'
              },
              {
                boundingBox: { x: 0, y: 30, width: 300, height: 25 },
                items: [{ x: 0, y: 30, width: 140, height: 25 }, { x: 150, y: 30, width: 140, height: 25 }],
                text: 'C  D'
              }
            ],
            roleMetadata: { fontSize: 10, fontFamily: 'Times-Roman', ascent: 0.75, descent: -0.25, lineCount: 2, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'X\nY',
              translatedCells: [
                { lineIndex: 0, cells: ['X', 'Y'] },
                { lineIndex: 1, cells: ['X', 'Y'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(4)
      const style = cellItems[0].attributes('style')
      expect(style).toContain('Times New Roman')
      expect(style).toContain('line-height: 1')
    })

    it('renders cell overlay for single-line multi-item table-cell block', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'tc-1',
            boundingBox: { x: 77.66, y: 407.68, width: 430.84, height: 11.76 },
            lines: [
              {
                boundingBox: { x: 77.66, y: 407.68, width: 430.84, height: 11.76 },
                items: [
                  { text: 'by ESMA direct supervision < 3 years.', x: 77.66, y: 407.68, width: 169.31, height: 10.02, right: 246.97 },
                  { text: '78 %', x: 428.04, y: 409.42, width: 22.83, height: 10.02, right: 450.87 },
                  { text: 'TBD', x: 488.46, y: 407.68, width: 20.04, height: 10.02, right: 508.5 }
                ],
                text: 'by ESMA direct supervision < 3 years. 78 % TBD'
              }
            ],
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'نتیجه نظارت مستقیم ESMA < 3 سال. 78 % TBD',
              translatedCells: [
                { lineIndex: 0, cells: ['نتیجه نظارت مستقیم ESMA < 3 سال.', '78 %', 'TBD'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(3)
      expect(cellItems[0].text()).toBe('نتیجه نظارت مستقیم ESMA < 3 سال.')
      expect(cellItems[1].text()).toBe('78 %')
      expect(cellItems[2].text()).toBe('TBD')
    })

    it('renders cell overlay for single-line two-item table-cell block', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'tc-2',
            boundingBox: { x: 217.34, y: 323, width: 296.361, height: 10.02 },
            lines: [
              {
                boundingBox: { x: 217.34, y: 323, width: 296.361, height: 10.02 },
                items: [
                  { text: 'Objective', x: 217.34, y: 323, width: 45.05, height: 10.02, right: 262.39 },
                  { text: 'Target', x: 483.12, y: 323, width: 30.58, height: 10.02, right: 513.7 }
                ],
                text: 'Objective Target'
              }
            ],
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'هدف هدف سالانه',
              translatedCells: [
                { lineIndex: 0, cells: ['هدف', 'هدف سالانه'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(2)
      expect(cellItems[0].text()).toBe('هدف')
      expect(cellItems[1].text()).toBe('هدف سالانه')
    })

    it('falls back to block text for single-line block without translatedCells', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'tc-no-cells',
            boundingBox: { x: 10, y: 20, width: 200, height: 40 },
            lines: [
              { boundingBox: { x: 10, y: 20, width: 200, height: 40 }, items: [{ text: 'A', x: 10, y: 20, width: 100, height: 40 }], text: 'A' }
            ],
            roleMetadata: { fontSize: 12, isStructured: true },
            translationState: { status: 'translated', translatedText: 'ترجمه A' }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(0)
      const blockText = wrapper.find('.pdf-block-overlay-item__text')
      expect(blockText.exists()).toBe(true)
      expect(blockText.text()).toBe('ترجمه A')
    })

    it('non-last cell width uses gap expansion ratio', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'gutter-1',
            boundingBox: { x: 0, y: 0, width: 400, height: 20 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 400, height: 20 },
                items: [
                  { text: 'A', x: 0, y: 0, width: 50, height: 14 },
                  { text: 'B', x: 150, y: 0, width: 50, height: 14 },
                  { text: 'C', x: 300, y: 0, width: 50, height: 14 }
                ],
                text: 'A  B  C'
              }
            ],
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'X\nY\nZ',
              translatedCells: [
                { lineIndex: 0, cells: ['X', 'Y', 'Z'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(3)
      const style0 = cellItems[0].attributes('style')
      const style1 = cellItems[1].attributes('style')
      expect(style0).toContain('width: 90px')
      expect(style1).toContain('width: 90px')
    })

    it('last cell width extends to lineRight without expansion', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'gutter-last',
            boundingBox: { x: 0, y: 0, width: 400, height: 20 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 400, height: 20 },
                items: [
                  { text: 'A', x: 0, y: 0, width: 50, height: 14 },
                  { text: 'B', x: 300, y: 0, width: 50, height: 14 }
                ],
                text: 'A  B'
              }
            ],
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'X\nY',
              translatedCells: [
                { lineIndex: 0, cells: ['X', 'Y'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(2)
      const lastStyle = cellItems[1].attributes('style')
      expect(lastStyle).toContain('width: 100px')
    })

    it('large gap only gives 40 percent expansion, not full gap', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'ratio-1',
            boundingBox: { x: 0, y: 0, width: 500, height: 20 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 500, height: 20 },
                items: [
                  { text: 'First', x: 0, y: 0, width: 100, height: 14 },
                  { text: 'Second', x: 400, y: 0, width: 80, height: 14 }
                ],
                text: 'First  Second'
              }
            ],
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'اول\nدوم',
              translatedCells: [
                { lineIndex: 0, cells: ['اول', 'دوم'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(2)
      const firstStyle = cellItems[0].attributes('style')
      expect(firstStyle).toContain('width: 220px')
    })

    it('cell width never drops below original item.width even with tiny gap', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'gutter-min',
            boundingBox: { x: 0, y: 0, width: 100, height: 20 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 100, height: 20 },
                items: [
                  { text: 'Wide', x: 0, y: 0, width: 80, height: 14 },
                  { text: 'Narrow', x: 82, y: 0, width: 18, height: 14 }
                ],
                text: 'Wide Narrow'
              }
            ],
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'X\nY',
              translatedCells: [
                { lineIndex: 0, cells: ['X', 'Y'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(2)
      const firstStyle = cellItems[0].attributes('style')
      expect(firstStyle).toContain('width: 80.8px')
    })

    it('zero-height cell item still renders with minimum height', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'min-h-1',
            boundingBox: { x: 0, y: 0, width: 300, height: 20 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 300, height: 20 },
                items: [
                  { text: 'A', x: 0, y: 0, width: 100, height: 0, right: 100 },
                  { text: 'B', x: 150, y: 0, width: 100, height: 0, right: 250 }
                ],
                text: 'A  B',
                fontSize: 10
              }
            ],
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'X\nY',
              translatedCells: [
                { lineIndex: 0, cells: ['X', 'Y'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(2)
      const style = cellItems[0].attributes('style')
      expect(style).toContain('height: 8px')
    })

    it('missing item.height uses blockFontSize fallback', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'min-h-2',
            boundingBox: { x: 0, y: 0, width: 300, height: 20 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 300, height: 20 },
                items: [
                  { text: 'A', x: 0, y: 0, width: 100, right: 100 },
                  { text: 'B', x: 150, y: 0, width: 100, right: 250 }
                ],
                text: 'A  B'
              }
            ],
            roleMetadata: { fontSize: 12, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'X\nY',
              translatedCells: [
                { lineIndex: 0, cells: ['X', 'Y'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(2)
      const style = cellItems[0].attributes('style')
      expect(style).toContain('height: 9.6px')
    })

    it('normal height items are unchanged', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'min-h-3',
            boundingBox: { x: 0, y: 0, width: 300, height: 40 },
            lines: [
              {
                boundingBox: { x: 0, y: 0, width: 300, height: 30 },
                items: [
                  { text: 'A', x: 0, y: 0, width: 100, height: 20, right: 100 },
                  { text: 'B', x: 150, y: 0, width: 100, height: 20, right: 250 }
                ],
                text: 'A  B'
              }
            ],
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'X\nY',
              translatedCells: [
                { lineIndex: 0, cells: ['X', 'Y'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const cellItems = wrapper.findAll('.pdf-cell-overlay-item')
      expect(cellItems.length).toBe(2)
      const style = cellItems[0].attributes('style')
      expect(style).toContain('height: 20px')
    })
  })

  describe('partial translatedCells fallback', () => {
    it('table-region with 9 source lines and translatedCells for only line 8 renders cell mode', () => {
      const lines = Array.from({ length: 9 }, (_, i) => ({
        boundingBox: { x: 78, y: 408 + i * 12, width: 430, height: 10 },
        items: [
          { text: `line${i}-col0`, x: 78, y: 408 + i * 12, width: 300, height: 10, right: 378 },
          { text: `line${i}-col1`, x: 428, y: 408 + i * 12, width: 20, height: 10, right: 448 }
        ],
        text: `line${i}-col0 line${i}-col1`
      }))

      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'table-region-9',
            boundingBox: { x: 78, y: 408, width: 430, height: 108 },
            lines,
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'translated only last line',
              translatedCells: [
                { lineIndex: 8, cells: ['translated-col0', 'translated-col1'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      expect(wrapper.attributes('data-pdf-overlay-mode')).toBe('cell')
      const allCells = wrapper.findAll('.pdf-cell-overlay-item')
      expect(allCells.length).toBeGreaterThanOrEqual(2)
    })

    it('missing translated cell falls back per-cell using source item text', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'partial-cells',
            boundingBox: { x: 78, y: 400, width: 430, height: 30 },
            lines: [
              {
                boundingBox: { x: 78, y: 400, width: 430, height: 10 },
                items: [
                  { text: 'src-A', x: 78, y: 400, width: 300, height: 10, right: 378 },
                  { text: 'src-B', x: 428, y: 400, width: 20, height: 10, right: 448 }
                ],
                text: 'src-A src-B'
              },
              {
                boundingBox: { x: 78, y: 412, width: 430, height: 10 },
                items: [
                  { text: 'src-C', x: 78, y: 412, width: 300, height: 10, right: 378 },
                  { text: 'src-D', x: 428, y: 412, width: 20, height: 10, right: 448 }
                ],
                text: 'src-C src-D'
              }
            ],
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'translated only one line',
              translatedCells: [
                { lineIndex: 0, cells: ['translated-A', 'translated-B'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const allCells = wrapper.findAll('.pdf-cell-overlay-item')
      expect(allCells.length).toBe(4)

      const texts = allCells.map((c) => c.text())
      expect(texts).toContain('translated-A')
      expect(texts).toContain('translated-B')
      expect(texts).toContain('src-C')
      expect(texts).toContain('src-D')
    })

    it('structured block with line/item geometry never falls back to block mode when translatedCells exists', () => {
      const wrapper = mount(PdfBlockOverlayItem, {
        props: {
          block: {
            id: 'structured-partial',
            boundingBox: { x: 78, y: 400, width: 430, height: 24 },
            lines: [
              {
                boundingBox: { x: 78, y: 400, width: 430, height: 10 },
                items: [
                  { text: 'X', x: 78, y: 400, width: 200, height: 10, right: 278 },
                  { text: 'Y', x: 328, y: 400, width: 50, height: 10, right: 378 }
                ],
                text: 'X Y'
              },
              {
                boundingBox: { x: 78, y: 412, width: 430, height: 10 },
                items: [
                  { text: 'Z', x: 78, y: 412, width: 200, height: 10, right: 278 },
                  { text: 'W', x: 328, y: 412, width: 50, height: 10, right: 378 }
                ],
                text: 'Z W'
              }
            ],
            roleMetadata: { fontSize: 10, isStructured: true },
            translationState: {
              status: 'translated',
              translatedText: 'partial',
              translatedCells: [
                { lineIndex: 0, cells: ['tr-A', 'tr-B'] }
              ]
            }
          },
          pageMetric: { scale: 1 }
        }
      })

      const mode = wrapper.find('.pdf-block-overlay-item')
      expect(mode.attributes('data-pdf-overlay-mode')).toBe('cell')
    })
  })
})
