import { describe, expect, it, vi } from 'vitest'
import { BenchmarkCoordinator } from './BenchmarkCoordinator.js'
import { EXECUTION_SCOPE, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { createRegionExecutionDispatcher } from './composables/regionExecutionDispatcher.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('BenchmarkCoordinator', () => {
  it('dispatches a canonical Benchmark RegionExecutionRequest unchanged', () => {
    const operation = Object.freeze({ promise: Promise.resolve(), cancel: vi.fn() })
    const regionExecutionDispatcher = {
      dispatchRegionExecution: vi.fn(() => operation)
    }
    const coordinator = new BenchmarkCoordinator({ regionExecutionDispatcher })
    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })

    const result = coordinator.coordinateRegionBenchmark({ region })

    expect(result).toBe(operation)
    expect(regionExecutionDispatcher.dispatchRegionExecution).toHaveBeenCalledWith({
      target: REGION_EXECUTION_TARGET.BENCHMARK,
      scope: EXECUTION_SCOPE.LIVE_REGION,
      region
    })
    expect(Object.isFrozen(regionExecutionDispatcher.dispatchRegionExecution.mock.calls[0][0])).toBe(true)
  })

  it('preserves dispatcher unsupported-target behavior without a Benchmark runner', () => {
    const coordinator = new BenchmarkCoordinator({
      regionExecutionDispatcher: createRegionExecutionDispatcher()
    })
    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })

    expect(() => coordinator.coordinateRegionBenchmark({ region })).toThrow('Unsupported region execution target')
  })

  it('rejects requests without a canonical PdfRegion before dispatch', () => {
    const regionExecutionDispatcher = { dispatchRegionExecution: vi.fn() }
    const coordinator = new BenchmarkCoordinator({ regionExecutionDispatcher })

    expect(() => coordinator.coordinateRegionBenchmark()).toThrow('Region Benchmark requires a canonical PdfRegion')
    expect(() => coordinator.coordinateRegionBenchmark({ region: { pageNumber: 1 } })).toThrow('Region Benchmark requires a canonical PdfRegion')
    expect(regionExecutionDispatcher.dispatchRegionExecution).not.toHaveBeenCalled()
  })
})
