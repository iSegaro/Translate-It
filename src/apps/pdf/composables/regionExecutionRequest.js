import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

export const REGION_EXECUTION_TARGET = Object.freeze({
  OCR: 'ocr',
  REGION_COMPARISON: 'region-comparison'
})

export const EXECUTION_SCOPE = Object.freeze({
  LIVE_REGION: 'live-region'
})

function isCanonicalPdfRegion(region) {
  if (!region || typeof region !== 'object') return false
  return Object.isFrozen(region) && createPdfRegion(region) !== null
}

export function isRegionExecutionRequest(request) {
  if (!request || typeof request !== 'object') return false

  return Object.isFrozen(request) &&
    Object.keys(request).length === 3 &&
    typeof request.target === 'string' && request.target.length > 0 &&
    request.scope === EXECUTION_SCOPE.LIVE_REGION &&
    Object.hasOwn(request, 'region') &&
    isCanonicalPdfRegion(request.region)
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

  const request = Object.freeze({
    target,
    scope,
    region
  })

  return isRegionExecutionRequest(request) ? request : null
}
