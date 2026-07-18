import { createExecutionOperation } from './composables/executionOperation.js'
import { isRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'

export const BENCHMARK_RUNNER_STATUS = Object.freeze({
  READY: 'ready',
  CANCELLED: 'cancelled'
})

class BenchmarkSession {
  constructor(request) {
    this.request = request
    this.state = 'created'
    this.cancelled = false
  }

  cancel() {
    this.cancelled = true
    this.state = 'cancelled'
  }

  async run() {
    this.state = 'initializing'
    await Promise.resolve()
    if (this.cancelled) return Object.freeze({ status: BENCHMARK_RUNNER_STATUS.CANCELLED })

    this.state = 'resolving-providers'
    await Promise.resolve()
    if (this.cancelled) return Object.freeze({ status: BENCHMARK_RUNNER_STATUS.CANCELLED })

    this.state = 'ready'
    return Object.freeze({
      status: BENCHMARK_RUNNER_STATUS.READY,
      providers: []
    })
  }
}

export class BenchmarkRunner {
  constructor({ createSession = (request) => new BenchmarkSession(request) } = {}) {
    this.createSession = createSession
  }

  execute(request) {
    if (!isRegionExecutionRequest(request) || request.target !== REGION_EXECUTION_TARGET.BENCHMARK) {
      throw new TypeError('BenchmarkRunner requires a canonical Benchmark RegionExecutionRequest')
    }

    const session = this.createSession(request)
    return createExecutionOperation({
      promise: Promise.resolve().then(() => session.run()),
      cancel() {
        session.cancel()
      },
      context: {
        target: request.target,
        request
      }
    })
  }
}
