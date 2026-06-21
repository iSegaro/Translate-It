import { describe, expect, it } from 'vitest'
import {
  buildPdfTextLinesFromItems,
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
})
