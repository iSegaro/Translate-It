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

  it('executes every planned provider in order', async () => {
    const providers = Object.freeze([{ id: 'first' }, { id: 'second' }])
    const plan = Object.freeze({ steps: Object.freeze([
      { providerId: 'first', state: 'pending' },
      { providerId: 'second', state: 'pending' }
    ]) })
    const results = [
      Object.freeze({ providerId: 'first', status: 'completed', output: 'first output' }),
      Object.freeze({ providerId: 'second', status: 'completed', output: 'second output' })
    ]
    const providerResolver = { resolve: vi.fn(() => providers) }
    const executionPlanner = { create: vi.fn(() => plan) }
    const providerExecutor = { execute: vi.fn(({ step }) => results.find(result => result.providerId === step.providerId)) }
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    await expect(new BenchmarkSession(request, { providerResolver, executionPlanner, providerExecutor }).run()).resolves.toEqual({
      status: BENCHMARK_RUNNER_STATUS.READY,
      providers,
      plan,
      results
    })
    expect(providerResolver.resolve).toHaveBeenCalledOnce()
    expect(executionPlanner.create).toHaveBeenCalledWith(providers)
    expect(providerExecutor.execute).toHaveBeenCalledTimes(2)
    expect(providerExecutor.execute).toHaveBeenNthCalledWith(1, { request, provider: providers[0], step: plan.steps[0] })
    expect(providerExecutor.execute).toHaveBeenNthCalledWith(2, { request, provider: providers[1], step: plan.steps[1] })
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

  it('waits for each execution before starting the next', async () => {
    const providers = Object.freeze([{ id: 'first' }, { id: 'second' }])
    const plan = Object.freeze({ steps: Object.freeze([
      { providerId: 'first', state: 'pending' },
      { providerId: 'second', state: 'pending' }
    ]) })
    let completeFirst
    const firstResult = new Promise(resolve => { completeFirst = resolve })
    const providerExecutor = {
      execute: vi.fn(({ step }) => step.providerId === 'first'
        ? firstResult
        : Object.freeze({ providerId: 'second', status: 'completed', output: 'second output' }))
    }
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })
    const run = new BenchmarkSession(request, {
      providerResolver: { resolve: () => providers },
      executionPlanner: { create: () => plan },
      providerExecutor
    }).run()

    await vi.waitFor(() => expect(providerExecutor.execute).toHaveBeenCalledOnce())
    completeFirst(Object.freeze({ providerId: 'first', status: 'completed', output: 'first output' }))
    await run
    expect(providerExecutor.execute).toHaveBeenCalledTimes(2)
  })

  it('propagates executor errors without starting subsequent steps', async () => {
    const providers = Object.freeze([{ id: 'first' }, { id: 'second' }])
    const plan = Object.freeze({ steps: Object.freeze([
      { providerId: 'first', state: 'pending' },
      { providerId: 'second', state: 'pending' }
    ]) })
    const error = new Error('provider failed')
    const providerExecutor = { execute: vi.fn(() => { throw error }) }
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    await expect(new BenchmarkSession(request, {
      providerResolver: { resolve: () => providers },
      executionPlanner: { create: () => plan },
      providerExecutor
    }).run()).rejects.toBe(error)
    expect(providerExecutor.execute).toHaveBeenCalledOnce()
  })

  it('rejects non-canonical Benchmark requests', () => {
    expect(() => new BenchmarkRunner().execute()).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
    expect(() => new BenchmarkRunner().execute({ target: REGION_EXECUTION_TARGET.BENCHMARK })).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
  })
})
