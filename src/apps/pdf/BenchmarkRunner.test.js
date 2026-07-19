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
      run: vi.fn(() => Promise.resolve({ status: BENCHMARK_RUNNER_STATUS.READY, candidates: [], results: [] })),
      cancel: vi.fn()
    }
    const createSession = vi.fn(() => session)
    const operation = new BenchmarkRunner({ createSession }).execute(request)

    expect(createSession).toHaveBeenCalledWith(request)
    expect(Object.isFrozen(operation)).toBe(true)
    expect(Object.isFrozen(operation.context)).toBe(true)
    expect(operation.context).toEqual({ target: REGION_EXECUTION_TARGET.BENCHMARK, request })
    expect(operation.cancel).toBeTypeOf('function')
    await expect(operation.promise).resolves.toEqual({ status: BENCHMARK_RUNNER_STATUS.READY, candidates: [], results: [] })
    expect(session.run).toHaveBeenCalledOnce()
  })

  it('cancels the session before candidate planning', async () => {
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })
    const operation = new BenchmarkRunner().execute(request)

    operation.cancel()

    await expect(operation.promise).resolves.toMatchObject({
      status: BENCHMARK_RUNNER_STATUS.CANCELLED,
      candidates: [],
      results: []
    })
  })

  it('executes every planned candidate and returns immutable results', async () => {
    const candidates = Object.freeze([
      Object.freeze({ candidateId: 'scale-1', configuration: Object.freeze({ scale: 1, language: 'eng' }) }),
      Object.freeze({ candidateId: 'scale-1.5', configuration: Object.freeze({ scale: 1.5, language: 'eng' }) })
    ])
    const configurations = Object.freeze([Object.freeze({ scale: 1, language: 'eng' })])
    const candidatePlanner = { createCandidates: vi.fn(() => candidates) }
    const executionOrder = []
    const executeFirst = vi.fn(() => {
      executionOrder.push('first-execute')
      return {
        promise: Promise.resolve({ status: 'recognized', data: { text: 'first' } }),
        cancel: vi.fn()
      }
    })
    const executeSecond = vi.fn(() => ({
      promise: Promise.resolve({ status: 'recognized', data: { text: 'second' } }),
      cancel: vi.fn()
    }))
    const prepare = vi.fn(() => {
      executionOrder.push('prepare')
      return Promise.resolve()
    })
    const createExecutor = vi.fn()
      .mockReturnValueOnce({ prepare })
      .mockReturnValueOnce({ execute: executeFirst })
      .mockReturnValueOnce({ execute: executeSecond })
    const onProgress = vi.fn()
    const timings = [50, 100, 125, 200, 260, 300]
    const clock = vi.fn(() => {
      executionOrder.push('clock')
      return timings.shift()
    })
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    const result = await new BenchmarkSession(request, {
      candidatePlanner,
      configurations,
      createExecutor,
      getPdfDocument: () => 'pdf-document',
      clock,
      onProgress
    }).run()

    expect(result).toEqual({
      status: BENCHMARK_RUNNER_STATUS.READY,
      candidates,
      results: [
        {
          candidateId: 'scale-1',
          configuration: { scale: 1, language: 'eng' },
          runtime: { startedAt: 100, completedAt: 125, latencyMs: 25 },
          output: { status: 'recognized', data: { text: 'first' } }
        },
        {
          candidateId: 'scale-1.5',
          configuration: { scale: 1.5, language: 'eng' },
          runtime: { startedAt: 200, completedAt: 260, latencyMs: 60 },
          output: { status: 'recognized', data: { text: 'second' } }
        }
      ],
      summary: {
        totalCandidates: 2,
        completedCandidates: 2,
        startedAt: 50,
        completedAt: 300,
        totalElapsedMs: 250
      }
    })
    expect(candidatePlanner.createCandidates).toHaveBeenCalledWith({ configurations })
    expect(createExecutor).toHaveBeenCalledTimes(3)
    expect(prepare).toHaveBeenCalledOnce()
    expect(prepare).toHaveBeenCalledWith({ language: 'eng' })
    expect(executionOrder.slice(0, 4)).toEqual(['prepare', 'clock', 'clock', 'first-execute'])
    expect(executeFirst).toHaveBeenCalledOnce()
    expect(executeSecond).toHaveBeenCalledOnce()
    expect(executeFirst).toHaveBeenCalledWith({ region: request.region, scale: 1, language: 'eng' })
    expect(executeSecond).toHaveBeenCalledWith({ region: request.region, scale: 1.5, language: 'eng' })
    expect(Object.isFrozen(result.results)).toBe(true)
    expect(Object.isFrozen(result.results[0])).toBe(true)
    expect(Object.isFrozen(result.results[0].runtime)).toBe(true)
    expect(onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({
      status: 'running',
      totalCandidates: 2,
      completedCandidates: 0,
      currentCandidate: candidates[0]
    }))
    expect(onProgress).toHaveBeenNthCalledWith(5, expect.objectContaining({
      status: 'completed',
      totalCandidates: 2,
      completedCandidates: 2,
      currentCandidate: null
    }))
    expect(Object.isFrozen(onProgress.mock.calls[0][0])).toBe(true)
  })

  it('evaluates assembled results only when ground truth is injected', async () => {
    const candidate = Object.freeze({ candidateId: 'scale-1-eng', configuration: Object.freeze({ scale: 1, language: 'eng' }) })
    const assembledResult = Object.freeze({ candidateId: candidate.candidateId, output: Object.freeze({ status: 'recognized' }) })
    const evaluatedResult = Object.freeze({ ...assembledResult, evaluation: Object.freeze({ cer: Object.freeze({ characterErrorRate: 0 }) }) })
    const resultAssembler = { assemble: vi.fn(() => assembledResult) }
    const benchmarkEvaluator = { evaluate: vi.fn(() => Object.freeze([evaluatedResult])) }
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    const result = await new BenchmarkSession(request, {
      candidatePlanner: { createCandidates: () => Object.freeze([candidate]) },
      createExecutor: () => ({ prepare: () => Promise.resolve(), execute: () => ({ promise: Promise.resolve({ status: 'recognized' }), cancel: vi.fn() }) }),
      resultAssembler,
      benchmarkEvaluator,
      groundTruth: 'reference'
    }).run()

    expect(benchmarkEvaluator.evaluate).toHaveBeenCalledWith(Object.freeze([assembledResult]), { groundTruth: 'reference' })
    expect(result.results).toEqual([evaluatedResult])
  })

  it('does not evaluate results without ground truth', async () => {
    const candidate = Object.freeze({ candidateId: 'scale-1-eng', configuration: Object.freeze({ scale: 1, language: 'eng' }) })
    const assembledResult = Object.freeze({ candidateId: candidate.candidateId, output: Object.freeze({ status: 'recognized' }) })
    const benchmarkEvaluator = { evaluate: vi.fn() }
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    const result = await new BenchmarkSession(request, {
      candidatePlanner: { createCandidates: () => Object.freeze([candidate]) },
      createExecutor: () => ({ prepare: () => Promise.resolve(), execute: () => ({ promise: Promise.resolve({ status: 'recognized' }), cancel: vi.fn() }) }),
      resultAssembler: { assemble: () => assembledResult },
      benchmarkEvaluator
    }).run()

    expect(benchmarkEvaluator.evaluate).not.toHaveBeenCalled()
    expect(result.results).toEqual([assembledResult])
  })

  it('executes candidates sequentially', async () => {
    const candidates = Object.freeze([
      Object.freeze({ candidateId: 'scale-1', configuration: Object.freeze({ scale: 1, language: 'eng' }) }),
      Object.freeze({ candidateId: 'scale-1.5', configuration: Object.freeze({ scale: 1.5, language: 'eng' }) })
    ])
    let resolveFirst
    const firstOperation = { promise: new Promise(resolve => { resolveFirst = resolve }), cancel: vi.fn() }
    const executeSecond = vi.fn(() => ({ promise: Promise.resolve({ status: 'recognized' }), cancel: vi.fn() }))
    const createExecutor = vi.fn()
      .mockReturnValueOnce({ prepare: () => Promise.resolve() })
      .mockReturnValueOnce({ execute: vi.fn(() => firstOperation) })
      .mockReturnValueOnce({ execute: executeSecond })
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    const run = new BenchmarkSession(request, {
      candidatePlanner: { createCandidates: () => candidates },
      createExecutor
    }).run()

    await vi.waitFor(() => expect(createExecutor).toHaveBeenCalledTimes(2))
    expect(executeSecond).not.toHaveBeenCalled()
    resolveFirst({ status: 'recognized' })
    await run
    expect(executeSecond).toHaveBeenCalledOnce()
  })

  it('cancels the active candidate and stops remaining candidates', async () => {
    const candidates = Object.freeze([
      Object.freeze({ candidateId: 'scale-1', configuration: Object.freeze({ scale: 1, language: 'eng' }) }),
      Object.freeze({ candidateId: 'scale-1.5', configuration: Object.freeze({ scale: 1.5, language: 'eng' }) })
    ])
    let resolveSecond
    const firstOperation = { promise: Promise.resolve({ status: 'recognized', data: { text: 'first' } }), cancel: vi.fn() }
    const secondOperation = { promise: new Promise(resolve => { resolveSecond = resolve }), cancel: vi.fn() }
    const executeSecond = vi.fn(() => secondOperation)
    const createExecutor = vi.fn()
      .mockReturnValueOnce({ prepare: () => Promise.resolve() })
      .mockReturnValueOnce({ execute: vi.fn(() => firstOperation) })
      .mockReturnValueOnce({ execute: executeSecond })
    const onProgress = vi.fn()
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })
    const session = new BenchmarkSession(request, {
      candidatePlanner: { createCandidates: () => candidates },
      createExecutor,
      onProgress
    })
    const run = session.run()

    await vi.waitFor(() => expect(createExecutor).toHaveBeenCalledTimes(3))
    session.cancel()
    expect(secondOperation.cancel).toHaveBeenCalledOnce()
    resolveSecond({ status: 'cancelled' })

    await expect(run).resolves.toMatchObject({
      status: BENCHMARK_RUNNER_STATUS.CANCELLED,
      candidates,
      results: [{ candidateId: 'scale-1' }],
      summary: { completedCandidates: 1 }
    })
    expect(createExecutor).toHaveBeenCalledTimes(3)
    expect(executeSecond).toHaveBeenCalledOnce()
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'cancelled',
      totalCandidates: 2,
      completedCandidates: 1,
      currentCandidate: null
    }))
  })

  it('propagates candidate executor failures without scheduling later candidates', async () => {
    const candidates = Object.freeze([
      Object.freeze({ candidateId: 'scale-1', configuration: Object.freeze({ scale: 1, language: 'eng' }) }),
      Object.freeze({ candidateId: 'scale-1.5', configuration: Object.freeze({ scale: 1.5, language: 'eng' }) })
    ])
    const error = new Error('OCR executor failed')
    const executeSecond = vi.fn()
    const createExecutor = vi.fn()
      .mockReturnValueOnce({ prepare: () => Promise.resolve() })
      .mockReturnValueOnce({ execute: () => ({ promise: Promise.reject(error), cancel: vi.fn() }) })
      .mockReturnValueOnce({ execute: executeSecond })
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    await expect(new BenchmarkSession(request, {
      candidatePlanner: { createCandidates: () => candidates },
      createExecutor
    }).run()).rejects.toBe(error)
    expect(executeSecond).not.toHaveBeenCalled()
  })

  it('prepares once before timing candidates and aborts on preparation failure', async () => {
    const candidate = Object.freeze({ candidateId: 'scale-1-eng', configuration: Object.freeze({ scale: 1, language: 'eng' }) })
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })
    const prepareError = new Error('worker initialization failed')
    const execute = vi.fn()

    await expect(new BenchmarkSession(request, {
      candidatePlanner: { createCandidates: () => Object.freeze([candidate]) },
      createExecutor: () => ({ prepare: () => Promise.reject(prepareError), execute })
    }).run()).rejects.toBe(prepareError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects non-canonical Benchmark requests', () => {
    expect(() => new BenchmarkRunner().execute()).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
    expect(() => new BenchmarkRunner().execute({ target: REGION_EXECUTION_TARGET.BENCHMARK })).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
  })
})
