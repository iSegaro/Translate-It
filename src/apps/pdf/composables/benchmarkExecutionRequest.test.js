import { describe, expect, it } from 'vitest'

import { createBenchmarkExecutionRequest, BENCHMARK_EXECUTION_TARGET } from './benchmarkExecutionRequest.js'
import { EXECUTION_SCOPE } from './regionExecutionRequest.js'
import { createBenchmarkCorpusModel } from '../../../../benchmarks/region-ocr/corpus/corpusModel.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

function createCorpus() {
  return createBenchmarkCorpusModel({
    corpusId: 'test-corpus',
    corpusVersion: '1.0.0',
    schemaVersion: '1.0.0',
    documents: []
  })
}

describe('BenchmarkExecutionRequest', () => {
  it('creates an immutable corpus benchmark request', () => {
    const corpus = createCorpus()
    const benchmark = { runId: 'run-001', corpus }
    const request = createBenchmarkExecutionRequest({ benchmark })

    expect(request).toEqual({
      target: BENCHMARK_EXECUTION_TARGET.BENCHMARK,
      scope: EXECUTION_SCOPE.CORPUS,
      benchmark
    })
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.benchmark)).toBe(true)
    expect(Object.isFrozen(request.benchmark.corpus)).toBe(true)
    expect(() => { request.benchmark.runId = 'changed' }).toThrow(TypeError)
  })

  it('rejects live-region, callback, unsupported scope, target, and metadata inputs', () => {
    const benchmark = { runId: 'run-001', corpus: createCorpus() }

    expect(createBenchmarkExecutionRequest({ benchmark, region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) })).toBeNull()
    expect(createBenchmarkExecutionRequest({ benchmark, executeRegion() {} })).toBeNull()
    expect(createBenchmarkExecutionRequest({ benchmark, onProgress() {} })).toBeNull()
    expect(createBenchmarkExecutionRequest({ benchmark, artifact: {} })).toBeNull()
    expect(createBenchmarkExecutionRequest({ benchmark, comparison: {} })).toBeNull()
    expect(createBenchmarkExecutionRequest({ benchmark, extra: true })).toBeNull()
    expect(createBenchmarkExecutionRequest({ benchmark, scope: EXECUTION_SCOPE.LIVE_REGION })).toBeNull()
    expect(createBenchmarkExecutionRequest({ benchmark, target: 'ocr' })).toBeNull()
  })
})
