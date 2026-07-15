import { cancelBenchmark, runBenchmark } from './runBenchmark.js'

export function createBenchmarkRunner(options) {
  let operation = null

  return Object.freeze({
    run(overrides = {}) {
      if (operation) throw new Error('Benchmark runner already has an active operation')
      const nextOperation = runBenchmark({ ...options, ...overrides })
      operation = nextOperation
      const clearOperation = () => {
        if (operation === nextOperation) operation = null
      }
      nextOperation.promise.then(clearOperation, clearOperation)
      return nextOperation
    },
    cancel() {
      cancelBenchmark(operation)
    }
  })
}
