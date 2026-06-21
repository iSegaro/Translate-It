const HIT_TOLERANCE = 6

export class PdfBlockTargetAdapter {
  constructor(session) {
    this.session = session
  }

  findBlockAtPoint({ pageNumber, x, y }) {
    const pageSession = this.session.pageSessions.get(pageNumber)
    if (!pageSession) return null

    const blocks = pageSession.getLogicalBlocks()
    let bestBlock = null
    let bestArea = Infinity

    for (const block of blocks) {
      const bounds = block.boundingBox
      if (!bounds) continue

      const expandedLeft = bounds.x - HIT_TOLERANCE
      const expandedTop = bounds.y - HIT_TOLERANCE
      const expandedRight = bounds.x + bounds.width + HIT_TOLERANCE
      const expandedBottom = bounds.y + bounds.height + HIT_TOLERANCE

      if (x >= expandedLeft && x <= expandedRight && y >= expandedTop && y <= expandedBottom) {
        const area = bounds.width * bounds.height
        if (area < bestArea) {
          bestArea = area
          bestBlock = block
        }
      }
    }

    return bestBlock
  }

  getBlockBounds(blockId) {
    for (const [, pageSession] of this.session.pageSessions) {
      const blocks = pageSession.getLogicalBlocks()
      for (const block of blocks) {
        if (block.id === blockId) {
          return {
            pageNumber: block.pageNumber,
            x: block.boundingBox?.x ?? 0,
            y: block.boundingBox?.y ?? 0,
            width: block.boundingBox?.width ?? 0,
            height: block.boundingBox?.height ?? 0
          }
        }
      }
    }

    return null
  }
}
