import { createPdfLogicalBlock } from './PdfLogicalBlock.js'
import { buildPdfLogicalBlocksFromLines } from './PdfLayoutAnalyzer.js'

export class PdfLogicalBlockBuilder {
  async build({
    documentIdentity = '',
    pageNumber = 0,
    pageSize = null,
    lines = []
  } = {}) {
    const rawBlocks = buildPdfLogicalBlocksFromLines(lines, {
      documentIdentity,
      pageNumber,
      pageSize
    })

    const resolvedBlocks = []

    for (const [index, block] of rawBlocks.entries()) {
      resolvedBlocks.push(await createPdfLogicalBlock({
        documentIdentity,
        pageNumber,
        role: block.role,
        boundingBox: block.boundingBox,
        pageSize,
        text: block.text,
        lines: block.lines,
        columnIndex: block.columnIndex,
        readingOrderIndex: index,
        roleMetadata: block.roleMetadata,
        source: 'pdf-text-content'
      }))
    }

    return resolvedBlocks
  }
}

export async function buildPdfLogicalBlocks(options) {
  return new PdfLogicalBlockBuilder().build(options)
}
