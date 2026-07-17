import { EXECUTION_SCOPE } from './regionExecutionRequest.js'

export const BENCHMARK_EXECUTION_TARGET = Object.freeze({
  BENCHMARK: 'benchmark'
})

function isBenchmarkIntent(benchmark) {
  return benchmark &&
    typeof benchmark === 'object' &&
    !Array.isArray(benchmark) &&
    Object.keys(benchmark).length === 2 &&
    typeof benchmark.runId === 'string' &&
    benchmark.runId.length > 0 &&
    benchmark.corpus &&
    typeof benchmark.corpus === 'object' &&
    !Array.isArray(benchmark.corpus) &&
    Object.isFrozen(benchmark.corpus)
}

export function createBenchmarkExecutionRequest({
  benchmark,
  target = BENCHMARK_EXECUTION_TARGET.BENCHMARK,
  scope = EXECUTION_SCOPE.CORPUS,
  ...metadata
} = {}) {
  if (!isBenchmarkIntent(benchmark)) return null
  if (target !== BENCHMARK_EXECUTION_TARGET.BENCHMARK) return null
  if (scope !== EXECUTION_SCOPE.CORPUS) return null
  if (Object.keys(metadata).length > 0) return null

  return Object.freeze({
    target,
    scope,
    benchmark: Object.freeze({ ...benchmark })
  })
}
