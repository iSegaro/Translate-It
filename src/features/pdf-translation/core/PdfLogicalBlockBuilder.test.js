import { describe, expect, it } from 'vitest'
import { buildPdfLogicalBlocks } from './PdfLogicalBlockBuilder.js'
import { createPdfLogicalBlock } from './PdfLogicalBlock.js'

function createLine({
  text,
  x,
  y,
  width,
  height,
  fontSize = height,
  columnIndex = 0,
  readingOrderIndex = 0,
  roleMetadata = {},
  items = [{ x, right: x + width, height }]
}) {
  return {
    text,
    boundingBox: { x, y, width, height },
    normalizedBoundingBox: { x: x / 500, y: y / 700, width: width / 500, height: height / 700 },
    fontSize,
    columnIndex,
    readingOrderIndex,
    items,
    direction: 'ltr',
    roleMetadata
  }
}

describe('PdfLogicalBlockBuilder', () => {
  it('merges paragraph lines into logical blocks and preserves headings separately', async () => {
    const blocks = await buildPdfLogicalBlocks({
      documentIdentity: 'fingerprint-1',
      pageNumber: 1,
      pageSize: { width: 500, height: 700 },
      lines: [
        createLine({
          text: 'Document title',
          x: 40,
          y: 20,
          width: 140,
          height: 20,
          fontSize: 18
        }),
        createLine({
          text: 'First paragraph line',
          x: 40,
          y: 70,
          width: 180,
          height: 14,
          fontSize: 10
        }),
        createLine({
          text: 'continued paragraph',
          x: 40,
          y: 88,
          width: 160,
          height: 14,
          fontSize: 10
        })
      ]
    })

    expect(blocks).toHaveLength(2)
    expect(blocks[0].role).toBe('heading')
    expect(blocks[1].role).toBe('paragraph')
    expect(blocks[1].text).toBe('First paragraph line continued paragraph')
  })

  it('keeps stable block identity independent of block ordering metadata', async () => {
    const [base, reordered, changed] = await Promise.all([
      createPdfLogicalBlock({
        documentIdentity: 'fingerprint-1',
        pageNumber: 2,
        role: 'paragraph',
        boundingBox: { x: 10, y: 20, width: 120, height: 40 },
        pageSize: { width: 500, height: 700 },
        text: 'Stable text',
        lines: [
          createLine({
            text: 'Stable text',
            x: 10,
            y: 20,
            width: 120,
            height: 40
          })
        ],
        readingOrderIndex: 0
      }),
      createPdfLogicalBlock({
        documentIdentity: 'fingerprint-1',
        pageNumber: 2,
        role: 'paragraph',
        boundingBox: { x: 10, y: 20, width: 120, height: 40 },
        pageSize: { width: 500, height: 700 },
        text: 'Stable text',
        lines: [
          createLine({
            text: 'Stable text',
            x: 10,
            y: 20,
            width: 120,
            height: 40
          })
        ],
        readingOrderIndex: 9
      }),
      createPdfLogicalBlock({
        documentIdentity: 'fingerprint-1',
        pageNumber: 2,
        role: 'paragraph',
        boundingBox: { x: 10, y: 20, width: 120, height: 40 },
        pageSize: { width: 500, height: 700 },
        text: 'Changed text',
        lines: [
          createLine({
            text: 'Changed text',
            x: 10,
            y: 20,
            width: 120,
            height: 40
          })
        ]
      })
    ])

    expect(base.id).toBe(reordered.id)
    expect(base.id).not.toBe(changed.id)
    expect(base.sourceTextHash).toHaveLength(64)
  })

  it('promotes repeated table-like lines into a basic table region block', async () => {
    const blocks = await buildPdfLogicalBlocks({
      documentIdentity: 'fingerprint-table',
      pageNumber: 3,
      pageSize: { width: 600, height: 800 },
      lines: [
        createLine({
          text: 'Q1 1200 Q2 1400',
          x: 40,
          y: 120,
          width: 220,
          height: 14,
          fontSize: 10,
          items: [
            { x: 40, right: 70, height: 10 },
            { x: 150, right: 190, height: 10 }
          ]
        }),
        createLine({
          text: 'Q3 1600 Q4 1800',
          x: 40,
          y: 140,
          width: 220,
          height: 14,
          fontSize: 10,
          items: [
            { x: 40, right: 70, height: 10 },
            { x: 150, right: 190, height: 10 }
          ]
        })
      ]
    })

    expect(blocks).toHaveLength(1)
    expect(blocks[0].role).toBe('table-region')
    expect(blocks[0].lineCount).toBe(2)
  })
})
