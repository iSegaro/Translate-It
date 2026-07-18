import { createExecutionOperation } from './composables/executionOperation.js'

export const BENCHMARK_RUNNER_STATUS = Object.freeze({
  NOT_IMPLEMENTED: 'not-implemented'
})

export class BenchmarkRunner {
  execute(request) {
    return createExecutionOperation({
      promise: Promise.resolve(Object.freeze({ status: BENCHMARK_RUNNER_STATUS.NOT_IMPLEMENTED })),
      cancel() {},
      context: {
        target: request.target,
        request
      }
    })
  }
}
