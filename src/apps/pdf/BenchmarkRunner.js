import { createExecutionOperation } from './composables/executionOperation.js'
import { isRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { BenchmarkProviderResolver } from './BenchmarkProviderResolver.js'

export const BENCHMARK_RUNNER_STATUS = Object.freeze({
  READY: 'ready',
  CANCELLED: 'cancelled'
})

export class BenchmarkSession {
  constructor(request, { providerResolver = new BenchmarkProviderResolver() } = {}) {
    this.request = request
    this.providerResolver = providerResolver
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

    const providers = this.providerResolver.resolve()

    this.state = 'ready'
    return Object.freeze({
      status: BENCHMARK_RUNNER_STATUS.READY,
      providers
    })
  }
}

export class BenchmarkRunner {
  constructor({ providerResolver, createSession = (request) => new BenchmarkSession(request, { providerResolver }) } = {}) {
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
