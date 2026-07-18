import { describe, expect, it, vi } from 'vitest'
import { BenchmarkRunner, BenchmarkSession, BENCHMARK_RUNNER_STATUS } from './BenchmarkRunner.js'
import { createRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('BenchmarkRunner', () => {
  it('creates a session and resolves the shared operation through its lifecycle', async () => {
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    const session = {
      run: vi.fn(() => Promise.resolve({ status: BENCHMARK_RUNNER_STATUS.READY, providers: [] })),
      cancel: vi.fn()
    }
    const createSession = vi.fn(() => session)
    const operation = new BenchmarkRunner({ createSession }).execute(request)

    expect(createSession).toHaveBeenCalledWith(request)
    expect(Object.isFrozen(operation)).toBe(true)
    expect(Object.isFrozen(operation.context)).toBe(true)
    expect(operation.context).toEqual({ target: REGION_EXECUTION_TARGET.BENCHMARK, request })
    expect(operation.cancel).toBeTypeOf('function')
    await expect(operation.promise).resolves.toEqual({ status: BENCHMARK_RUNNER_STATUS.READY, providers: [] })
    expect(session.run).toHaveBeenCalledOnce()
  })

  it('cancels the session before provider resolution', async () => {
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })
    const operation = new BenchmarkRunner().execute(request)

    operation.cancel()

    await expect(operation.promise).resolves.toEqual({ status: BENCHMARK_RUNNER_STATUS.CANCELLED })
  })

  it('delegates provider discovery to its resolver', async () => {
    const providers = Object.freeze([{ id: 'provider' }])
    const providerResolver = { resolve: vi.fn(() => providers) }
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    await expect(new BenchmarkSession(request, { providerResolver }).run()).resolves.toEqual({
      status: BENCHMARK_RUNNER_STATUS.READY,
      providers
    })
    expect(providerResolver.resolve).toHaveBeenCalledOnce()
  })

  it('rejects non-canonical Benchmark requests', () => {
    expect(() => new BenchmarkRunner().execute()).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
    expect(() => new BenchmarkRunner().execute({ target: REGION_EXECUTION_TARGET.BENCHMARK })).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
  })
})
