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
    const executeFirst = vi.fn(() => ({
      promise: Promise.resolve({ status: 'recognized', data: { text: 'first' } }),
      cancel: vi.fn()
    }))
    const executeSecond = vi.fn(() => ({
      promise: Promise.resolve({ status: 'recognized', data: { text: 'second' } }),
      cancel: vi.fn()
    }))
    const createExecutor = vi.fn()
      .mockReturnValueOnce({ execute: executeFirst })
      .mockReturnValueOnce({ execute: executeSecond })
    const onProgress = vi.fn()
    const clock = vi.fn()
      .mockReturnValueOnce(50)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(125)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(260)
      .mockReturnValueOnce(300)
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
    expect(createExecutor).toHaveBeenCalledTimes(2)
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

  it('executes candidates sequentially', async () => {
    const candidates = Object.freeze([
      Object.freeze({ candidateId: 'scale-1', configuration: Object.freeze({ scale: 1, language: 'eng' }) }),
      Object.freeze({ candidateId: 'scale-1.5', configuration: Object.freeze({ scale: 1.5, language: 'eng' }) })
    ])
    let resolveFirst
    const firstOperation = { promise: new Promise(resolve => { resolveFirst = resolve }), cancel: vi.fn() }
    const executeSecond = vi.fn(() => ({ promise: Promise.resolve({ status: 'recognized' }), cancel: vi.fn() }))
    const createExecutor = vi.fn()
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

    await vi.waitFor(() => expect(createExecutor).toHaveBeenCalledOnce())
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

    await vi.waitFor(() => expect(createExecutor).toHaveBeenCalledTimes(2))
    session.cancel()
    expect(secondOperation.cancel).toHaveBeenCalledOnce()
    resolveSecond({ status: 'cancelled' })

    await expect(run).resolves.toMatchObject({
      status: BENCHMARK_RUNNER_STATUS.CANCELLED,
      candidates,
      results: [{ candidateId: 'scale-1' }],
      summary: { completedCandidates: 1 }
    })
    expect(createExecutor).toHaveBeenCalledTimes(2)
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

  it('rejects non-canonical Benchmark requests', () => {
    expect(() => new BenchmarkRunner().execute()).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
    expect(() => new BenchmarkRunner().execute({ target: REGION_EXECUTION_TARGET.BENCHMARK })).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
  })
})
