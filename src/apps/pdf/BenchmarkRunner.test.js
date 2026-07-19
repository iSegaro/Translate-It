import { describe, expect, it, vi } from 'vitest'
import { BenchmarkRunner, BenchmarkSession, BENCHMARK_RUNNER_STATUS } from './BenchmarkRunner.js'
import { BenchmarkExecutionPlanner } from './BenchmarkExecutionPlanner.js'
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
    const outputs = ['first output', 'second output']
    const providerResolver = { resolve: vi.fn(() => providers) }
    const executionPlanner = new BenchmarkExecutionPlanner()
    const createPlan = vi.spyOn(executionPlanner, 'create')
    const providerExecutor = { execute: vi.fn(({ step }) => outputs[step.providerId === 'first' ? 0 : 1]) }
    const clock = vi.fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(125)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(260)
    const scoreReport = Object.freeze({
      providers: Object.freeze([{ providerId: 'first', score: null }, { providerId: 'second', score: null }]),
      winner: null
    })
    const scoringEngine = { score: vi.fn(() => scoreReport) }
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    const result = await new BenchmarkSession(request, {
      providerResolver,
      executionPlanner,
      providerExecutor,
      clock,
      scoringEngine
    }).run()

    expect(result).toEqual({
      status: BENCHMARK_RUNNER_STATUS.READY,
      providers,
      plan: {
        steps: [
          { providerId: 'first', state: 'completed' },
          { providerId: 'second', state: 'completed' }
        ]
      },
      results: [
        { providerId: 'first', status: 'completed', output: 'first output', startedAt: 100, completedAt: 125, durationMs: 25 },
        { providerId: 'second', status: 'completed', output: 'second output', startedAt: 200, completedAt: 260, durationMs: 60 }
      ],
      scoreReport
    })
    expect(clock).toHaveBeenCalledTimes(4)
    expect(Object.isFrozen(result.results)).toBe(true)
    expect(Object.isFrozen(result.results[0])).toBe(true)
    expect(scoringEngine.score).toHaveBeenCalledWith(result.results)
    expect(providerResolver.resolve).toHaveBeenCalledOnce()
    expect(createPlan).toHaveBeenCalledWith(providers)
    expect(providerExecutor.execute).toHaveBeenCalledTimes(2)
    expect(providerExecutor.execute).toHaveBeenNthCalledWith(1, {
      request,
      provider: providers[0],
      step: { providerId: 'first', state: 'running' }
    })
    expect(providerExecutor.execute).toHaveBeenNthCalledWith(2, {
      request,
      provider: providers[1],
      step: { providerId: 'second', state: 'running' }
    })
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
      results: [],
      scoreReport: { providers: [], winner: null }
    })
    expect(providerExecutor.execute).not.toHaveBeenCalled()
  })

  it('waits for each execution before starting the next', async () => {
    const providers = Object.freeze([{ id: 'first' }, { id: 'second' }])
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
      executionPlanner: new BenchmarkExecutionPlanner(),
      providerExecutor
    }).run()

    await vi.waitFor(() => expect(providerExecutor.execute).toHaveBeenCalledOnce())
    completeFirst(Object.freeze({ providerId: 'first', status: 'completed', output: 'first output' }))
    await run
    expect(providerExecutor.execute).toHaveBeenCalledTimes(2)
  })

  it('propagates executor errors without starting subsequent steps', async () => {
    const providers = Object.freeze([{ id: 'first' }, { id: 'second' }])
    const error = new Error('provider failed')
    const providerExecutor = { execute: vi.fn(() => { throw error }) }
    const executionPlanner = new BenchmarkExecutionPlanner()
    const markFailed = vi.spyOn(executionPlanner, 'markFailed')
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    await expect(new BenchmarkSession(request, {
      providerResolver: { resolve: () => providers },
      executionPlanner,
      providerExecutor
    }).run()).rejects.toBe(error)
    expect(providerExecutor.execute).toHaveBeenCalledOnce()
    expect(markFailed).toHaveBeenCalledOnce()
    expect(markFailed.mock.results[0].value.steps).toEqual([
      { providerId: 'first', state: 'failed' },
      { providerId: 'second', state: 'pending' }
    ])
  })

  it('rejects non-canonical Benchmark requests', () => {
    expect(() => new BenchmarkRunner().execute()).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
    expect(() => new BenchmarkRunner().execute({ target: REGION_EXECUTION_TARGET.BENCHMARK })).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
  })
})
