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

    await expect(operation.promise).resolves.toEqual({ status: BENCHMARK_RUNNER_STATUS.CANCELLED })
  })

  it('returns planned candidates without executing OCR', async () => {
    const candidates = Object.freeze([
      Object.freeze({ candidateId: 'scale-1', configuration: Object.freeze({ scale: 1, language: 'eng' }) }),
      Object.freeze({ candidateId: 'scale-1.5', configuration: Object.freeze({ scale: 1.5, language: 'eng' }) })
    ])
    const configurations = Object.freeze([Object.freeze({ scale: 1, language: 'eng' })])
    const candidatePlanner = { createCandidates: vi.fn(() => candidates) }
    const request = createRegionExecutionRequest({
      region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }),
      target: REGION_EXECUTION_TARGET.BENCHMARK
    })

    const result = await new BenchmarkSession(request, {
      candidatePlanner,
      configurations
    }).run()

    expect(result).toEqual({
      status: BENCHMARK_RUNNER_STATUS.READY,
      candidates,
      results: []
    })
    expect(candidatePlanner.createCandidates).toHaveBeenCalledWith({ configurations })
    expect(Object.isFrozen(result.results)).toBe(true)
  })

  it('rejects non-canonical Benchmark requests', () => {
    expect(() => new BenchmarkRunner().execute()).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
    expect(() => new BenchmarkRunner().execute({ target: REGION_EXECUTION_TARGET.BENCHMARK })).toThrow('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
  })
})
