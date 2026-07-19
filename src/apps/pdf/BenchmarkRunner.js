import { createExecutionOperation } from './composables/executionOperation.js'
import { isRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { BenchmarkCandidatePlanner } from './BenchmarkCandidatePlanner.js'

export const BENCHMARK_RUNNER_STATUS = Object.freeze({
  READY: 'ready',
  CANCELLED: 'cancelled'
})

export class BenchmarkSession {
  constructor(request, {
    candidatePlanner = new BenchmarkCandidatePlanner(),
    configurations = Object.freeze([])
  } = {}) {
    this.request = request
    this.candidatePlanner = candidatePlanner
    this.configurations = configurations
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

    this.state = 'planning-candidates'
    await Promise.resolve()
    if (this.cancelled) return Object.freeze({ status: BENCHMARK_RUNNER_STATUS.CANCELLED })

    const candidates = this.candidatePlanner.createCandidates({ configurations: this.configurations })

    this.state = 'ready'
    return Object.freeze({
      status: BENCHMARK_RUNNER_STATUS.READY,
      candidates,
      results: Object.freeze([])
    })
  }
}

export class BenchmarkRunner {
  constructor({
    candidatePlanner,
    configurations,
    createSession = (request) => new BenchmarkSession(request, {
      candidatePlanner,
      configurations
    })
  } = {}) {
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
