import { describe, expect, it } from 'vitest'
import { BenchmarkCoordinator, BENCHMARK_COORDINATOR_STATUS } from './BenchmarkCoordinator.js'
import { EXECUTION_SCOPE, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('BenchmarkCoordinator', () => {
  it('constructs a canonical Benchmark RegionExecutionRequest without dispatching', () => {
    const coordinator = new BenchmarkCoordinator()
    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })

    const result = coordinator.coordinateRegionBenchmark({ region })

    expect(result).toEqual({
      status: BENCHMARK_COORDINATOR_STATUS.NOT_IMPLEMENTED,
      request: {
        target: REGION_EXECUTION_TARGET.BENCHMARK,
        scope: EXECUTION_SCOPE.LIVE_REGION,
        region
      }
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.request)).toBe(true)
  })

  it('rejects requests without a canonical PdfRegion', () => {
    const coordinator = new BenchmarkCoordinator()

    expect(() => coordinator.coordinateRegionBenchmark()).toThrow('Region Benchmark requires a canonical PdfRegion')
    expect(() => coordinator.coordinateRegionBenchmark({ region: { pageNumber: 1 } })).toThrow('Region Benchmark requires a canonical PdfRegion')
  })
})
