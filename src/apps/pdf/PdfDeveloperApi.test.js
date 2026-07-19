import { describe, expect, it, vi } from 'vitest'
import { PDF_DEVELOPER_CAPABILITY, PdfDeveloperApi } from './PdfDeveloperApi.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('PdfDeveloperApi', () => {
  it('exposes region comparison as a developer capability', () => {
    const api = new PdfDeveloperApi({
      regionComparisonCoordinator: { coordinateRegionComparison: vi.fn() }
    })

    expect(api.getCapabilities()).toContain(PDF_DEVELOPER_CAPABILITY.REGION_COMPARISON)
    expect(api.hasCapability(PDF_DEVELOPER_CAPABILITY.REGION_COMPARISON)).toBe(true)
    expect(api.runRegionComparison).toBeTypeOf('function')
    expect(api.invokeCapability).toBeTypeOf('function')
  })

  it('delegates region comparison requests through its coordinator boundary', () => {
    const operation = Object.freeze({ promise: Promise.resolve(), cancel: vi.fn() })
    const regionComparisonCoordinator = {
      coordinateRegionComparison: vi.fn(() => operation)
    }
    const api = new PdfDeveloperApi({ regionComparisonCoordinator })
    const request = { region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) }

    expect(api.runRegionComparison(request)).toBe(operation)
    expect(regionComparisonCoordinator.coordinateRegionComparison).toHaveBeenCalledWith(request)
  })

  it('passes dispatcher behavior through unchanged', () => {
    const error = new RangeError('Unsupported region execution target')
    const api = new PdfDeveloperApi({
      regionComparisonCoordinator: {
        coordinateRegionComparison: vi.fn(() => { throw error })
      }
    })
    const request = { region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) }

    expect(() => api.runRegionComparison(request)).toThrow(error)
    expect(() => api.invokeCapability(PDF_DEVELOPER_CAPABILITY.REGION_COMPARISON, request)).toThrow(error)
  })
})
