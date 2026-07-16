import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

export const REGION_EXECUTION_TARGET = Object.freeze({
  OCR: 'ocr'
})

function isCanonicalPdfRegion(region) {
  if (!region || typeof region !== 'object') return false
  return Object.isFrozen(region) && createPdfRegion(region) !== null
}

export function createRegionExecutionRequest({ region, target = REGION_EXECUTION_TARGET.OCR } = {}) {
  if (!isCanonicalPdfRegion(region)) return null
  if (!Object.values(REGION_EXECUTION_TARGET).includes(target)) return null

  return Object.freeze({
    region,
    target
  })
}
