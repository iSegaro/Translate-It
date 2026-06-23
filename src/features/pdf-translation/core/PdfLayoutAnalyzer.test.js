import { describe, expect, it } from 'vitest'
import {
  buildPdfTextLinesFromItems,
  buildPdfLogicalBlocksFromLines,
  detectPdfLineRole,
  resolvePdfReadingOrder
} from './PdfLayoutAnalyzer.js'

function createTextItem({
  str,
  x,
  baselineY,
  width,
  height,
  dir = 'ltr'
}) {
  return {
    str,
    transform: [1, 0, 0, height, x, baselineY],
    width,
    height,
    dir
  }
}

describe('PdfLayoutAnalyzer', () => {
  it('groups PDF text items into line-level structures', () => {
    const lines = buildPdfTextLinesFromItems([
      createTextItem({ str: 'Hello', x: 40, baselineY: 650, width: 30, height: 14 }),
      createTextItem({ str: 'world', x: 80, baselineY: 650, width: 42, height: 14 }),
      createTextItem({ str: 'Next line', x: 40, baselineY: 620, width: 70, height: 14 })
    ], { width: 500, height: 700 })

    expect(lines).toHaveLength(2)
    expect(lines[0].text).toBe('Hello world')
    expect(lines[1].text).toBe('Next line')
    expect(lines[0].boundingBox).toMatchObject({ x: 40, y: 36 })
  })

  it('resolves a basic two-column reading order left column first', () => {
    const ordered = resolvePdfReadingOrder([
      {
        text: 'Left 1',
        direction: 'ltr',
        boundingBox: { x: 40, y: 30, width: 120, height: 16 },
        items: [],
        fontSize: 12,
        roleMetadata: {}
      },
      {
        text: 'Left 2',
        direction: 'ltr',
        boundingBox: { x: 40, y: 70, width: 120, height: 16 },
        items: [],
        fontSize: 12,
        roleMetadata: {}
      },
      {
        text: 'Right 1',
        direction: 'ltr',
        boundingBox: { x: 300, y: 30, width: 120, height: 16 },
        items: [],
        fontSize: 12,
        roleMetadata: {}
      },
      {
        text: 'Right 2',
        direction: 'ltr',
        boundingBox: { x: 300, y: 70, width: 120, height: 16 },
        items: [],
        fontSize: 12,
        roleMetadata: {}
      }
    ], { width: 500, height: 700 })

    expect(ordered.map((line) => line.text)).toEqual([
      'Left 1',
      'Left 2',
      'Right 1',
      'Right 2'
    ])
  })

  it('detects heading, list item, caption, and table-like lines', () => {
    expect(detectPdfLineRole({
      text: 'Annual Report',
      fontSize: 18,
      boundingBox: { x: 20, y: 20, width: 120, height: 20 },
      items: [],
      roleMetadata: {}
    }, {
      medianFontSize: 10,
      pageSize: { width: 500, height: 700 }
    })).toBe('heading')

    expect(detectPdfLineRole({
      text: '• First item',
      fontSize: 10,
      boundingBox: { x: 20, y: 60, width: 120, height: 16 },
      items: [],
      roleMetadata: {}
    })).toBe('list-item')

    expect(detectPdfLineRole({
      text: 'Figure 1: Example chart',
      fontSize: 10,
      boundingBox: { x: 20, y: 100, width: 180, height: 16 },
      items: [],
      roleMetadata: {}
    })).toBe('caption')

    expect(detectPdfLineRole({
      text: 'Jan 1200 Feb 1400',
      fontSize: 10,
      boundingBox: { x: 20, y: 140, width: 220, height: 16 },
      items: [
        { x: 20, right: 60, height: 10 },
        { x: 140, right: 190, height: 10 }
      ],
      roleMetadata: {}
    })).toBe('table-cell')
  })

  it('propagates fontFamily from styles into line roleMetadata', () => {
    const styles = {
      'F1': { fontFamily: 'Times-Roman', ascent: 0.75, descent: -0.25, vertical: false },
      'F2': { fontFamily: 'Helvetica', ascent: 0.8, descent: -0.2, vertical: false }
    }

    const lines = buildPdfTextLinesFromItems([
      { str: 'Hello', transform: [1, 0, 0, 12, 40, 650], width: 30, height: 12, fontName: 'F1' },
      { str: 'world', transform: [1, 0, 0, 12, 80, 650], width: 42, height: 12, fontName: 'F1' }
    ], { width: 500, height: 700 }, styles)

    expect(lines).toHaveLength(1)
    expect(lines[0].roleMetadata.fontFamily).toBe('Times-Roman')
    expect(lines[0].roleMetadata.ascent).toBe(0.75)
    expect(lines[0].roleMetadata.descent).toBe(-0.25)
  })

  it('propagates vertical flag from styles', () => {
    const styles = {
      'F1': { fontFamily: 'SimSun', ascent: 0.8, descent: -0.2, vertical: true }
    }

    const lines = buildPdfTextLinesFromItems([
      { str: '竖排', transform: [1, 0, 0, 12, 40, 650], width: 30, height: 12, fontName: 'F1' }
    ], { width: 500, height: 700 }, styles)

    expect(lines).toHaveLength(1)
    expect(lines[0].roleMetadata.vertical).toBe(true)
  })

  it('uses dominant font family when items have mixed fonts', () => {
    const styles = {
      'F1': { fontFamily: 'Times-Roman', ascent: 0.75, descent: -0.25 },
      'F2': { fontFamily: 'Helvetica', ascent: 0.8, descent: -0.2 }
    }

    const lines = buildPdfTextLinesFromItems([
      { str: 'A', transform: [1, 0, 0, 12, 40, 650], width: 10, height: 12, fontName: 'F1' },
      { str: 'B', transform: [1, 0, 0, 12, 60, 650], width: 10, height: 12, fontName: 'F1' },
      { str: 'C', transform: [1, 0, 0, 12, 80, 650], width: 10, height: 12, fontName: 'F2' }
    ], { width: 500, height: 700 }, styles)

    expect(lines).toHaveLength(1)
    expect(lines[0].roleMetadata.fontFamily).toBe('Times-Roman')
  })

  it('does not add font metadata when styles is null', () => {
    const lines = buildPdfTextLinesFromItems([
      { str: 'Hello', transform: [1, 0, 0, 12, 40, 650], width: 30, height: 12, fontName: 'F1' }
    ], { width: 500, height: 700 }, null)

    expect(lines).toHaveLength(1)
    expect(lines[0].roleMetadata.fontFamily).toBeUndefined()
    expect(lines[0].roleMetadata.ascent).toBeUndefined()
    expect(lines[0].roleMetadata.descent).toBeUndefined()
    expect(lines[0].roleMetadata.vertical).toBeUndefined()
  })

  it('does not add font metadata when styles is omitted', () => {
    const lines = buildPdfTextLinesFromItems([
      { str: 'Hello', transform: [1, 0, 0, 12, 40, 650], width: 30, height: 12, fontName: 'F1' }
    ], { width: 500, height: 700 })

    expect(lines).toHaveLength(1)
    expect(lines[0].roleMetadata.fontFamily).toBeUndefined()
    expect(lines[0].roleMetadata.ascent).toBeUndefined()
    expect(lines[0].roleMetadata.descent).toBeUndefined()
  })

  it('handles missing fontName gracefully with styles provided', () => {
    const styles = {
      'F1': { fontFamily: 'Times-Roman', ascent: 0.75, descent: -0.25 }
    }

    const lines = buildPdfTextLinesFromItems([
      { str: 'Hello', transform: [1, 0, 0, 12, 40, 650], width: 30, height: 12 },
      { str: 'world', transform: [1, 0, 0, 12, 80, 650], width: 42, height: 12, fontName: 'F1' }
    ], { width: 500, height: 700 }, styles)

    expect(lines).toHaveLength(1)
    expect(lines[0].roleMetadata.fontFamily).toBe('Times-Roman')
  })

  describe('structured block detection', () => {
    it('sets isStructured=true for table-region blocks', async () => {
      const lines = [
        { text: 'Col A  Col B', fontSize: 10, boundingBox: { x: 20, y: 100, width: 200, height: 14 }, items: [{ x: 20, right: 80, height: 10 }, { x: 120, right: 180, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 },
        { text: 'Val 1  Val 2', fontSize: 10, boundingBox: { x: 20, y: 118, width: 200, height: 14 }, items: [{ x: 20, right: 70, height: 10 }, { x: 120, right: 175, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 1 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(1)
      expect(blocks[0].roleMetadata.isStructured).toBe(true)
    })

    it('sets isStructured=true for table-cell blocks', async () => {
      const lines = [
        { text: 'Col A  Col B', fontSize: 10, boundingBox: { x: 20, y: 100, width: 200, height: 14 }, items: [{ x: 20, right: 80, height: 10 }, { x: 120, right: 180, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(1)
      expect(blocks[0].role).toBe('table-cell')
      expect(blocks[0].roleMetadata.isStructured).toBe(true)
    })

    it('detects schedule-like blocks and sets isStructured=true', async () => {
      const lines = [
        { text: 'Mon 30 Mar  6.00-8.15pm  Classes', fontSize: 10, boundingBox: { x: 40, y: 200, width: 300, height: 14 }, items: [{ x: 40, right: 100, height: 10 }, { x: 160, right: 240, height: 10 }, { x: 270, right: 340, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 },
        { text: 'Wed 1 Apr   6.00-8.15pm  Classes', fontSize: 10, boundingBox: { x: 40, y: 218, width: 300, height: 14 }, items: [{ x: 42, right: 102, height: 10 }, { x: 162, right: 242, height: 10 }, { x: 272, right: 342, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 1 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(1)
      expect(blocks[0].roleMetadata.isStructured).toBe(true)
    })

    it('does NOT set isStructured for normal multi-line paragraphs', async () => {
      const lines = [
        { text: 'This is the first paragraph line', fontSize: 10, boundingBox: { x: 40, y: 200, width: 300, height: 14 }, items: [{ x: 40, right: 300, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 },
        { text: 'and this is the second paragraph line', fontSize: 10, boundingBox: { x: 40, y: 218, width: 300, height: 14 }, items: [{ x: 40, right: 310, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 1 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(1)
      expect(blocks[0].roleMetadata.isStructured).toBe(false)
    })

    it('does NOT detect schedule-like when lines have different item counts', async () => {
      const lines = [
        { text: 'Row with two items', fontSize: 10, boundingBox: { x: 40, y: 200, width: 200, height: 14 }, items: [{ x: 40, right: 120, height: 10 }, { x: 160, right: 240, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 },
        { text: 'Single item row', fontSize: 10, boundingBox: { x: 40, y: 260, width: 100, height: 14 }, items: [{ x: 40, right: 100, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 1 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(2)
      expect(blocks[0].roleMetadata.isStructured).toBe(true)
      expect(blocks[1].roleMetadata.isStructured).toBe(false)
    })

    it('block is structured via table-cell path even when schedule-like font check fails', async () => {
      const lines = [
        { text: 'Row with two items', fontSize: 10, boundingBox: { x: 40, y: 200, width: 200, height: 14 }, items: [{ x: 40, right: 120, height: 10 }, { x: 160, right: 240, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 },
        { text: 'Different size row', fontSize: 16, boundingBox: { x: 40, y: 218, width: 200, height: 20 }, items: [{ x: 40, right: 140, height: 16 }, { x: 180, right: 240, height: 16 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 1 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(1)
      expect(blocks[0].roleMetadata.isStructured).toBe(true)
    })

    it('block is structured via table-cell path even when schedule-like x-alignment fails', async () => {
      const lines = [
        { text: 'Row with two items', fontSize: 10, boundingBox: { x: 40, y: 200, width: 200, height: 14 }, items: [{ x: 40, right: 120, height: 10 }, { x: 160, right: 240, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 },
        { text: 'Misaligned row', fontSize: 10, boundingBox: { x: 200, y: 218, width: 200, height: 14 }, items: [{ x: 200, right: 280, height: 10 }, { x: 340, right: 420, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 1 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(2)
      expect(blocks[0].roleMetadata.isStructured).toBe(true)
      expect(blocks[1].roleMetadata.isStructured).toBe(true)
    })

    it('does NOT detect schedule-like for non-table-like lines with font size mismatch', async () => {
      const lines = [
        { text: 'First line of schedule with enough text to avoid heading detection', fontSize: 10, boundingBox: { x: 40, y: 200, width: 400, height: 14 }, items: [{ x: 40, right: 100, height: 10 }, { x: 120, right: 180, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 },
        { text: 'Second line with larger font and also enough text to avoid heading detection', fontSize: 18, boundingBox: { x: 40, y: 220, width: 400, height: 22 }, items: [{ x: 40, right: 100, height: 18 }, { x: 120, right: 180, height: 18 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 1 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(1)
      expect(blocks[0].roleMetadata.isStructured).toBe(false)
    })

    it('block is structured via table-cell path even when schedule-like font check fails for different sizes', async () => {
      const lines = [
        { text: 'Small schedule row text here', fontSize: 10, boundingBox: { x: 40, y: 200, width: 200, height: 14 }, items: [{ x: 40, right: 120, height: 10 }, { x: 160, right: 240, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 },
        { text: 'Large schedule row text here', fontSize: 16, boundingBox: { x: 40, y: 218, width: 200, height: 20 }, items: [{ x: 40, right: 140, height: 16 }, { x: 180, right: 240, height: 16 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 1 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(1)
      expect(blocks[0].roleMetadata.isStructured).toBe(true)
    })

    it('detects schedule-like with x-position tolerance of 8', async () => {
      const lines = [
        { text: 'Mon 30 Mar  6.00-8.15pm  Classes', fontSize: 10, boundingBox: { x: 40, y: 200, width: 300, height: 14 }, items: [{ x: 40, right: 100, height: 10 }, { x: 160, right: 240, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 },
        { text: 'Wed 1 Apr   6.00-8.15pm  Classes', fontSize: 10, boundingBox: { x: 44, y: 218, width: 300, height: 14 }, items: [{ x: 44, right: 104, height: 10 }, { x: 164, right: 244, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 1 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(1)
      expect(blocks[0].roleMetadata.isStructured).toBe(true)
    })

    it('does NOT detect schedule-like when rows are single TextItems (known limitation)', async () => {
      const lines = [
        { text: 'Mon 30 Mar  6.00-8.15pm  Classes', fontSize: 10, boundingBox: { x: 40, y: 200, width: 300, height: 14 }, items: [{ x: 40, right: 300, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 0 },
        { text: 'Wed 1 Apr   6.00-8.15pm  Classes', fontSize: 10, boundingBox: { x: 40, y: 218, width: 300, height: 14 }, items: [{ x: 40, right: 300, height: 10 }], direction: 'ltr', roleMetadata: {}, columnIndex: 0, readingOrderIndex: 1 }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { pageSize: { width: 500, height: 700 } })
      expect(blocks).toHaveLength(1)
      expect(blocks[0].roleMetadata.isStructured).toBe(false)
    })
  })
})
