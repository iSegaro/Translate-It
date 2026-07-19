import { describe, expect, it } from 'vitest'

import { createRegionExecutionRequest, EXECUTION_SCOPE, isRegionExecutionRequest, REGION_EXECUTION_TARGET } from './regionExecutionRequest.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('RegionExecutionRequest', () => {
  it('accepts canonical PdfRegion', () => {
    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    const request = createRegionExecutionRequest({ region })

    expect(request).toEqual({
      target: REGION_EXECUTION_TARGET.OCR,
      scope: EXECUTION_SCOPE.LIVE_REGION,
      region
    })
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.region)).toBe(true)
    expect(request.region).toBe(region)
  })

  it('rejects invalid request inputs', () => {
    expect(createRegionExecutionRequest({ region: Object.freeze({ pageNumber: 1, left: 3, top: 4, right: 3, bottom: 2 }) })).toBeNull()
    expect(createRegionExecutionRequest({ region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }), target: 'unsupported' })).toBeNull()
    expect(createRegionExecutionRequest({ region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }), scope: 'corpus' })).toBeNull()
    expect(createRegionExecutionRequest({ region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }), regionComparison: {} })).toBeNull()
  })

  it('validates the shared request shape without target-specific policy', () => {
    const request = Object.freeze({
      target: 'future-target',
      scope: EXECUTION_SCOPE.LIVE_REGION,
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    })

    expect(isRegionExecutionRequest(request)).toBe(true)
    expect(isRegionExecutionRequest({ ...request })).toBe(false)
  })

  it('remains immutable', () => {
    const request = createRegionExecutionRequest({ region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) })

    expect(() => { request.target = 'region-comparison' }).toThrow(TypeError)
    expect(request.target).toBe(REGION_EXECUTION_TARGET.OCR)
  })
})
