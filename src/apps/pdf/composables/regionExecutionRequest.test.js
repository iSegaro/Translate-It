import { describe, expect, it } from 'vitest'

import { createRegionExecutionRequest, REGION_EXECUTION_TARGET } from './regionExecutionRequest.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('RegionExecutionRequest', () => {
  it('accepts canonical PdfRegion', () => {
    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    const request = createRegionExecutionRequest({ region })

    expect(request).toEqual({ region, target: REGION_EXECUTION_TARGET.OCR })
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.region)).toBe(true)
  })

  it('rejects invalid request inputs', () => {
    expect(createRegionExecutionRequest({ region: Object.freeze({ pageNumber: 1, left: 3, top: 4, right: 3, bottom: 2 }) })).toBeNull()
    expect(createRegionExecutionRequest({ region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }), target: 'benchmark' })).toBeNull()
  })

  it('remains immutable', () => {
    const request = createRegionExecutionRequest({ region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) })

    expect(() => { request.target = 'benchmark' }).toThrow(TypeError)
    expect(request.target).toBe(REGION_EXECUTION_TARGET.OCR)
  })
})
