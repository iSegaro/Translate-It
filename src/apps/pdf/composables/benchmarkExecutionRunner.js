import { runBenchmark } from '../../../../benchmarks/region-ocr/runner/runBenchmark.js'
import { createExecutionOperation } from './executionOperation.js'
import { BENCHMARK_EXECUTION_TARGET } from './benchmarkExecutionRequest.js'
import { EXECUTION_SCOPE } from './regionExecutionRequest.js'

function isBenchmarkRequest(request) {
  return request?.target === BENCHMARK_EXECUTION_TARGET.BENCHMARK &&
    request.scope === EXECUTION_SCOPE.CORPUS &&
    typeof request.benchmark?.runId === 'string' &&
    request.benchmark.runId.length > 0 &&
    request.benchmark.corpus &&
    typeof request.benchmark.corpus === 'object'
}

export function createBenchmarkExecutionRunner({ executeRegion, run = runBenchmark } = {}) {
  if (typeof executeRegion !== 'function') {
    throw new TypeError('Benchmark execution runner requires executeRegion')
  }

  return function runBenchmarkExecution(request) {
    if (!isBenchmarkRequest(request)) {
      throw new TypeError('Benchmark execution runner requires a corpus benchmark request')
    }

    const benchmarkOperation = run({
      runId: request.benchmark.runId,
      corpus: request.benchmark.corpus,
      executeRegion
    })

    return createExecutionOperation({
      promise: benchmarkOperation.promise,
      cancel: () => benchmarkOperation.cancel(),
      context: {
        target: request.target,
        runId: request.benchmark.runId
      }
    })
  }
}
