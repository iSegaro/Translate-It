import { createRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'

export class RegionComparisonCoordinator {
  constructor({ regionExecutionDispatcher } = {}) {
    if (typeof regionExecutionDispatcher?.dispatchRegionExecution !== 'function') {
      throw new TypeError('RegionExecutionDispatcher is required')
    }

    this.regionExecutionDispatcher = regionExecutionDispatcher
  }

  coordinateRegionComparison({ region } = {}) {
    const request = createRegionExecutionRequest({
      region,
      target: REGION_EXECUTION_TARGET.REGION_COMPARISON
    })
    if (!request) throw new TypeError('RegionComparison requires a canonical PdfRegion')

    return this.regionExecutionDispatcher.dispatchRegionExecution(request)
  }
}
