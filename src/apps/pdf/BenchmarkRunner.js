import { createExecutionOperation } from './composables/executionOperation.js'
import { isRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { BenchmarkExecutionPlanner } from './BenchmarkExecutionPlanner.js'
import { BenchmarkProviderExecutor } from './BenchmarkProviderExecutor.js'
import { BenchmarkProviderResolver } from './BenchmarkProviderResolver.js'

export const BENCHMARK_RUNNER_STATUS = Object.freeze({
  READY: 'ready',
  CANCELLED: 'cancelled'
})

export class BenchmarkSession {
  constructor(request, {
    providerResolver = new BenchmarkProviderResolver(),
    executionPlanner = new BenchmarkExecutionPlanner(),
    providerExecutor = new BenchmarkProviderExecutor()
  } = {}) {
    this.request = request
    this.providerResolver = providerResolver
    this.executionPlanner = executionPlanner
    this.providerExecutor = providerExecutor
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
    const plan = this.executionPlanner.create(providers)
    const results = []

    for (const [index, step] of plan.steps.entries()) {
      results.push(await this.providerExecutor.execute({
        request: this.request,
        provider: providers[index],
        step
      }))
    }

    this.state = 'ready'
    return Object.freeze({
      status: BENCHMARK_RUNNER_STATUS.READY,
      providers,
      plan,
      results: Object.freeze(results)
    })
  }
}

export class BenchmarkRunner {
  constructor({
    providerResolver,
    executionPlanner,
    providerExecutor,
    createSession = (request) => new BenchmarkSession(request, { providerResolver, executionPlanner, providerExecutor })
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
