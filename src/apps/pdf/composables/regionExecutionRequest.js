import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

export const REGION_EXECUTION_TARGET = Object.freeze({
  OCR: 'ocr'
})

export const EXECUTION_SCOPE = Object.freeze({
  LIVE_REGION: 'live-region'
})

function isCanonicalPdfRegion(region) {
  if (!region || typeof region !== 'object') return false
  return Object.isFrozen(region) && createPdfRegion(region) !== null
}

export function createRegionExecutionRequest({
  region,
  target = REGION_EXECUTION_TARGET.OCR,
  scope = EXECUTION_SCOPE.LIVE_REGION,
  ...metadata
} = {}) {
  if (!isCanonicalPdfRegion(region)) return null
  if (!Object.values(REGION_EXECUTION_TARGET).includes(target)) return null
  if (scope !== EXECUTION_SCOPE.LIVE_REGION) return null
  if (Object.keys(metadata).length > 0) return null

  return Object.freeze({
    target,
    scope,
    region
  })
}
