import { createRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'

export const BENCHMARK_COORDINATOR_STATUS = Object.freeze({
  NOT_IMPLEMENTED: 'not-implemented'
})

export class BenchmarkCoordinator {
  coordinateRegionBenchmark({ region } = {}) {
    const request = createRegionExecutionRequest({
      region,
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })
    if (!request) throw new TypeError('Region Benchmark requires a canonical PdfRegion')

    return Object.freeze({
      status: BENCHMARK_COORDINATOR_STATUS.NOT_IMPLEMENTED,
      request
    })
  }
}
