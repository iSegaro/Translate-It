import { describe, expect, it, vi } from 'vitest'

import { createRegionExecutionDispatcher } from './regionExecutionDispatcher.js'
import { createRegionExecutionRequest, REGION_EXECUTION_TARGET } from './regionExecutionRequest.js'
import { createExecutionOperation } from './executionOperation.js'
import { BenchmarkRunner, BENCHMARK_RUNNER_STATUS } from '../BenchmarkRunner.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('RegionExecutionDispatcher', () => {
  it('routes OCR request and returns the exact runner operation', () => {
    const request = createRegionExecutionRequest({ region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) })
    const operation = createExecutionOperation({
      promise: Promise.resolve({ status: 'recognized', text: 'ok' }),
      cancel: vi.fn(),
      context: { target: 'ocr' }
    })
    const runner = vi.fn(() => operation)
    const dispatcher = createRegionExecutionDispatcher({ runners: { ocr: runner } })

    const result = dispatcher.dispatchRegionExecution(request)

    expect(runner).toHaveBeenCalledOnce()
    expect(runner).toHaveBeenCalledWith(request)
    expect(result).toBe(operation)
  })

  it('routes Benchmark requests to BenchmarkRunner without OCR execution', async () => {
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })
    const runner = new BenchmarkRunner({ providerResolver: { resolve: () => [] } })
    const execute = vi.spyOn(runner, 'execute')
    const dispatcher = createRegionExecutionDispatcher({
      runners: { [REGION_EXECUTION_TARGET.BENCHMARK]: (benchmarkRequest) => runner.execute(benchmarkRequest) }
    })

    const operation = dispatcher.dispatchRegionExecution(request)

    expect(execute).toHaveBeenCalledWith(request)
    expect(operation.context.target).toBe(REGION_EXECUTION_TARGET.BENCHMARK)
    await expect(operation.promise).resolves.toEqual({
      status: BENCHMARK_RUNNER_STATUS.READY,
      providers: [],
      plan: { steps: [] },
      results: [],
      scoreReport: { providers: [], winner: null }
    })
  })

  it('rejects unsupported target', () => {
    const dispatcher = createRegionExecutionDispatcher({ runners: {} })

    expect(() => dispatcher.dispatchRegionExecution({ target: 'unsupported' })).toThrow(RangeError)
  })

  it('rejects a missing execution request', () => {
    const dispatcher = createRegionExecutionDispatcher({ runners: {} })

    expect(() => dispatcher.dispatchRegionExecution()).toThrow(TypeError)
  })

  it('does not mutate request or await operation', () => {
    const request = createRegionExecutionRequest({ region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) })
    const operation = createExecutionOperation({
      promise: new Promise(() => {}),
      cancel: vi.fn(),
      context: { target: 'ocr' }
    })
    const dispatcher = createRegionExecutionDispatcher({ runners: { ocr: vi.fn(() => operation) } })
    const snapshot = structuredClone(request)

    expect(dispatcher.dispatchRegionExecution(request)).toBe(operation)

    expect(request).toEqual(snapshot)
    expect(Object.isFrozen(request)).toBe(true)
  })
})
