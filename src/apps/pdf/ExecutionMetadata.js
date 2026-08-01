import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

function requireFiniteNumber(value, field) {
  if (!Number.isFinite(value)) throw new TypeError(`ExecutionMetadata requires ${field}`)
}

function isCanonicalPdfRegion(region) {
  return Object.isFrozen(region) && createPdfRegion(region) !== null
}

export function createExecutionMetadata({
  startedAt,
  completedAt,
  totalElapsedMs,
  pageNumber,
  region
} = {}) {
  requireFiniteNumber(startedAt, 'startedAt')
  requireFiniteNumber(completedAt, 'completedAt')
  requireFiniteNumber(totalElapsedMs, 'totalElapsedMs')
  if (!Number.isInteger(pageNumber) || pageNumber <= 0) throw new TypeError('ExecutionMetadata requires pageNumber')
  if (!isCanonicalPdfRegion(region)) throw new TypeError('ExecutionMetadata requires region')
  if (pageNumber !== region.pageNumber) throw new TypeError('ExecutionMetadata pageNumber must match region')

  return Object.freeze({ startedAt, completedAt, totalElapsedMs, pageNumber, region })
}
