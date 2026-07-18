import { describe, expect, it, vi } from 'vitest'
import { PDF_DEVELOPER_CAPABILITY, PdfDeveloperApi } from './PdfDeveloperApi.js'
import { BENCHMARK_COORDINATOR_STATUS } from './BenchmarkCoordinator.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('PdfDeveloperApi', () => {
  it('exposes Region Benchmark as a developer capability', () => {
    const api = new PdfDeveloperApi()

    expect(api.getCapabilities()).toContain(PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK)
    expect(api.hasCapability(PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK)).toBe(true)
    expect(api.runRegionBenchmark).toBeTypeOf('function')
    expect(api.invokeCapability).toBeTypeOf('function')
  })

  it('delegates Region Benchmark requests through its coordinator boundary', () => {
    const benchmarkCoordinator = {
      coordinateRegionBenchmark: vi.fn(() => ({ status: BENCHMARK_COORDINATOR_STATUS.NOT_IMPLEMENTED }))
    }
    const api = new PdfDeveloperApi({ benchmarkCoordinator })
    const request = { region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) }

    expect(api.runRegionBenchmark(request)).toEqual({ status: BENCHMARK_COORDINATOR_STATUS.NOT_IMPLEMENTED })
    expect(benchmarkCoordinator.coordinateRegionBenchmark).toHaveBeenCalledWith(request)
  })

  it('consistently returns the Region Benchmark placeholder result', () => {
    const api = new PdfDeveloperApi()
    const request = { region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) }

    expect(api.runRegionBenchmark(request).status).toBe(BENCHMARK_COORDINATOR_STATUS.NOT_IMPLEMENTED)
    expect(api.invokeCapability(PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK, request).status).toBe(BENCHMARK_COORDINATOR_STATUS.NOT_IMPLEMENTED)
  })
})
