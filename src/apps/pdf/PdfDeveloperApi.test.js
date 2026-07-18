import { describe, expect, it, vi } from 'vitest'
import { PDF_DEVELOPER_CAPABILITY, PdfDeveloperApi } from './PdfDeveloperApi.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('PdfDeveloperApi', () => {
  it('exposes Region Benchmark as a developer capability', () => {
    const api = new PdfDeveloperApi({
      benchmarkCoordinator: { coordinateRegionBenchmark: vi.fn() }
    })

    expect(api.getCapabilities()).toContain(PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK)
    expect(api.hasCapability(PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK)).toBe(true)
    expect(api.runRegionBenchmark).toBeTypeOf('function')
    expect(api.invokeCapability).toBeTypeOf('function')
  })

  it('delegates Region Benchmark requests through its coordinator boundary', () => {
    const operation = Object.freeze({ promise: Promise.resolve(), cancel: vi.fn() })
    const benchmarkCoordinator = {
      coordinateRegionBenchmark: vi.fn(() => operation)
    }
    const api = new PdfDeveloperApi({ benchmarkCoordinator })
    const request = { region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) }

    expect(api.runRegionBenchmark(request)).toBe(operation)
    expect(benchmarkCoordinator.coordinateRegionBenchmark).toHaveBeenCalledWith(request)
  })

  it('passes dispatcher behavior through unchanged', () => {
    const error = new RangeError('Unsupported region execution target')
    const api = new PdfDeveloperApi({
      benchmarkCoordinator: {
        coordinateRegionBenchmark: vi.fn(() => { throw error })
      }
    })
    const request = { region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) }

    expect(() => api.runRegionBenchmark(request)).toThrow(error)
    expect(() => api.invokeCapability(PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK, request)).toThrow(error)
  })
})
