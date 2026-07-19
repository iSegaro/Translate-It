import { createExecutionOperation } from './composables/executionOperation.js'
import { isRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { BenchmarkExecutionPlanner } from './BenchmarkExecutionPlanner.js'
import { BenchmarkProviderExecutor } from './BenchmarkProviderExecutor.js'
import { BenchmarkProviderResolver } from './BenchmarkProviderResolver.js'
import { BenchmarkScoringEngine } from './BenchmarkScoringEngine.js'

export const BENCHMARK_RUNNER_STATUS = Object.freeze({
  READY: 'ready',
  CANCELLED: 'cancelled'
})

export class BenchmarkSession {
  constructor(request, {
    providerResolver = new BenchmarkProviderResolver(),
    executionPlanner = new BenchmarkExecutionPlanner(),
    providerExecutor = new BenchmarkProviderExecutor(),
    clock = () => Date.now(),
    scoringEngine = new BenchmarkScoringEngine()
  } = {}) {
    this.request = request
    this.providerResolver = providerResolver
    this.executionPlanner = executionPlanner
    this.providerExecutor = providerExecutor
    this.clock = clock
    this.scoringEngine = scoringEngine
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
    let plan = this.executionPlanner.create(providers)
    const results = []

    for (const [index, pendingStep] of plan.steps.entries()) {
      plan = this.executionPlanner.markRunning(plan, pendingStep)
      const step = plan.steps[index]

      try {
        const startedAt = this.clock()
        const output = await this.providerExecutor.execute({
          request: this.request,
          provider: providers[index],
          step
        })
        const completedAt = this.clock()
        results.push(Object.freeze({
          providerId: step.providerId,
          status: 'completed',
          output,
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt
        }))
        plan = this.executionPlanner.markCompleted(plan, step)
      } catch (error) {
        plan = this.executionPlanner.markFailed(plan, step)
        throw error
      }
    }

    const frozenResults = Object.freeze(results)
    const scoreReport = this.scoringEngine.score(frozenResults)

    this.state = 'ready'
    return Object.freeze({
      status: BENCHMARK_RUNNER_STATUS.READY,
      providers,
      plan,
      results: frozenResults,
      scoreReport
    })
  }
}

export class BenchmarkRunner {
  constructor({
    providerResolver,
    executionPlanner,
    providerExecutor,
    clock,
    scoringEngine,
    createSession = (request) => new BenchmarkSession(request, {
      providerResolver,
      executionPlanner,
      providerExecutor,
      clock,
      scoringEngine
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
