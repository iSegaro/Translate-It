import { describe, expect, it, vi } from 'vitest'

import { createBenchmarkExecutionRunner } from './benchmarkExecutionRunner.js'
import { createBenchmarkExecutionRequest } from './benchmarkExecutionRequest.js'
import { createBenchmarkCorpusModel } from '../../../../benchmarks/region-ocr/corpus/corpusModel.js'

function createRequest() {
  const corpus = createBenchmarkCorpusModel({
    corpusId: 'test-corpus',
    corpusVersion: '1.0.0',
    schemaVersion: '1.0.0',
    documents: []
  })
  return createBenchmarkExecutionRequest({ benchmark: { runId: 'run-001', corpus } })
}

describe('Benchmark execution runner', () => {
  it('adapts benchmark runtime result to an immutable operation', async () => {
    const result = Object.freeze({ status: 'completed' })
    const runtimeOperation = { promise: Promise.resolve(result), cancel: vi.fn() }
    const run = vi.fn(() => runtimeOperation)
    const executeRegion = vi.fn()
    const request = createRequest()

    const operation = createBenchmarkExecutionRunner({ executeRegion, run })(request)

    expect(run).toHaveBeenCalledWith({ runId: 'run-001', corpus: request.benchmark.corpus, executeRegion })
    expect(Object.isFrozen(operation)).toBe(true)
    expect(Object.isFrozen(operation.context)).toBe(true)
    expect(operation.context).toEqual({ target: 'benchmark', runId: 'run-001' })
    expect(operation.context).not.toHaveProperty('corpus')
    expect(await operation.promise).toBe(result)

    operation.cancel()
    expect(runtimeOperation.cancel).toHaveBeenCalledOnce()
  })
})
