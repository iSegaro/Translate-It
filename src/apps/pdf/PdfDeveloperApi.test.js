import { describe, expect, it, vi } from 'vitest'
import { PDF_DEVELOPER_CAPABILITY, PdfDeveloperApi } from './PdfDeveloperApi.js'

describe('PdfDeveloperApi', () => {
  it('exposes Region Benchmark as a developer capability', () => {
    const api = new PdfDeveloperApi()

    expect(api.getCapabilities()).toContain(PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK)
    expect(api.hasCapability(PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK)).toBe(true)
    expect(api.runRegionBenchmark).toBeTypeOf('function')
    expect(api.invokeCapability).toBeTypeOf('function')
  })

  it('consistently rejects Region Benchmark until implementation exists', () => {
    const api = new PdfDeveloperApi()

    expect(() => api.runRegionBenchmark()).toThrow('Developer capability not implemented: region-benchmark')
    expect(() => api.invokeCapability(PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK)).toThrow('Developer capability not implemented: region-benchmark')
  })

  it('does not invoke Benchmark execution from its placeholder', () => {
    const execution = vi.fn()
    const api = new PdfDeveloperApi()

    expect(() => api.runRegionBenchmark(execution)).toThrow('Developer capability not implemented: region-benchmark')
    expect(execution).not.toHaveBeenCalled()
  })
})
