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

  it('delegates provider resolution and plan creation', async () => {
    const providers = Object.freeze([{ id: 'provider' }])
    const plan = Object.freeze({ steps: Object.freeze([{ providerId: 'provider', state: 'pending' }]) })
    const result = Object.freeze({ providerId: 'provider', status: 'completed', output: 'translated text' })
    const providerResolver = { resolve: vi.fn(() => providers) }
    const executionPlanner = { create: vi.fn(() => plan) }
    const providerExecutor = { execute: vi.fn(() => result) }
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    await expect(new BenchmarkSession(request, { providerResolver, executionPlanner, providerExecutor }).run()).resolves.toEqual({
      status: BENCHMARK_RUNNER_STATUS.READY,
      providers,
      plan,
      results: [result]
    })
    expect(providerResolver.resolve).toHaveBeenCalledOnce()
    expect(executionPlanner.create).toHaveBeenCalledWith(providers)
    expect(providerExecutor.execute).toHaveBeenCalledWith({ request, provider: providers[0], step: plan.steps[0] })
  })

  it('skips execution for an empty plan', async () => {
    const providerResolver = { resolve: vi.fn(() => []) }
    const executionPlanner = { create: vi.fn(() => Object.freeze({ steps: Object.freeze([]) })) }
    const providerExecutor = { execute: vi.fn() }
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    await expect(new BenchmarkSession(request, { providerResolver, executionPlanner, providerExecutor }).run()).resolves.toMatchObject({
      status: BENCHMARK_RUNNER_STATUS.READY,
      providers: [],
      plan: { steps: [] },
      results: []
    })
    expect(providerExecutor.execute).not.toHaveBeenCalled()
  })

  it('rejects non-canonical Benchmark requests', () => {
    expect(() => new BenchmarkRunner().execute()).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
    expect(() => new BenchmarkRunner().execute({ target: REGION_EXECUTION_TARGET.BENCHMARK })).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
  })
})
