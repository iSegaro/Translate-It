import { createRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'

export class BenchmarkCoordinator {
  constructor({ regionExecutionDispatcher } = {}) {
    if (typeof regionExecutionDispatcher?.dispatchRegionExecution !== 'function') {
      throw new TypeError('RegionExecutionDispatcher is required')
    }

    this.regionExecutionDispatcher = regionExecutionDispatcher
  }

  coordinateRegionBenchmark({ region } = {}) {
    const request = createRegionExecutionRequest({
      region,
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })
    if (!request) throw new TypeError('Region Benchmark requires a canonical PdfRegion')

    return this.regionExecutionDispatcher.dispatchRegionExecution(request)
  }
}
