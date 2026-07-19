import { describe, expect, it, vi } from 'vitest'
import { RegionComparisonCoordinator } from './RegionComparisonCoordinator.js'
import { EXECUTION_SCOPE, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { createRegionExecutionDispatcher } from './composables/regionExecutionDispatcher.js'
import { RegionComparisonRunner, REGION_COMPARISON_RUNNER_STATUS } from './RegionComparisonRunner.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('RegionComparisonCoordinator', () => {
  it('dispatches a canonical RegionComparison RegionExecutionRequest unchanged', () => {
    const operation = Object.freeze({ promise: Promise.resolve(), cancel: vi.fn() })
    const regionExecutionDispatcher = {
      dispatchRegionExecution: vi.fn(() => operation)
    }
    const coordinator = new RegionComparisonCoordinator({ regionExecutionDispatcher })
    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })

    const result = coordinator.coordinateRegionComparison({ region })

    expect(result).toBe(operation)
    expect(regionExecutionDispatcher.dispatchRegionExecution).toHaveBeenCalledWith({
      target: REGION_EXECUTION_TARGET.REGION_COMPARISON,
      scope: EXECUTION_SCOPE.LIVE_REGION,
      region
    })
    expect(Object.isFrozen(regionExecutionDispatcher.dispatchRegionExecution.mock.calls[0][0])).toBe(true)
  })

  it('resolves RegionComparison through the registered dispatcher target', async () => {
    const coordinator = new RegionComparisonCoordinator({
      regionExecutionDispatcher: createRegionExecutionDispatcher({
        runners: {
          [REGION_EXECUTION_TARGET.REGION_COMPARISON]: (request) => new RegionComparisonRunner({
            candidatePlanner: { createCandidates: () => [] }
          }).execute(request)
        }
      })
    })
    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })

    await expect(coordinator.coordinateRegionComparison({ region }).promise).resolves.toMatchObject({
      status: REGION_COMPARISON_RUNNER_STATUS.READY,
      candidates: [],
      results: [],
      summary: { totalCandidates: 0, completedCandidates: 0 }
    })
  })

  it('rejects requests without a canonical PdfRegion before dispatch', () => {
    const regionExecutionDispatcher = { dispatchRegionExecution: vi.fn() }
    const coordinator = new RegionComparisonCoordinator({ regionExecutionDispatcher })

    expect(() => coordinator.coordinateRegionComparison()).toThrow('RegionComparison requires a canonical PdfRegion')
    expect(() => coordinator.coordinateRegionComparison({ region: { pageNumber: 1 } })).toThrow('RegionComparison requires a canonical PdfRegion')
    expect(regionExecutionDispatcher.dispatchRegionExecution).not.toHaveBeenCalled()
  })
})
