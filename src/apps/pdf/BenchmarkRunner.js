import { createExecutionOperation } from './composables/executionOperation.js'
import { isRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { BenchmarkCandidatePlanner } from './BenchmarkCandidatePlanner.js'
import { BenchmarkResultAssembler } from './BenchmarkResultAssembler.js'
import { PdfRegionOcrExecutor } from '@/features/pdf-translation/core/PdfRegionOcrExecutor.js'

export const BENCHMARK_RUNNER_STATUS = Object.freeze({
  READY: 'ready',
  CANCELLED: 'cancelled'
})

export class BenchmarkSession {
  constructor(request, {
    candidatePlanner = new BenchmarkCandidatePlanner(),
    configurations = Object.freeze([]),
    createExecutor = (options) => new PdfRegionOcrExecutor(options),
    getPdfDocument = () => undefined,
    clock = () => Date.now(),
    resultAssembler = new BenchmarkResultAssembler()
  } = {}) {
    this.request = request
    this.candidatePlanner = candidatePlanner
    this.configurations = configurations
    this.createExecutor = createExecutor
    this.getPdfDocument = getPdfDocument
    this.clock = clock
    this.resultAssembler = resultAssembler
    this.state = 'created'
    this.cancelled = false
    this.activeOperation = null
  }

  cancel() {
    this.cancelled = true
    this.state = 'cancelled'
    this.activeOperation?.cancel()
  }

  executeCandidate({ request, candidate }) {
    const executor = this.createExecutor({ pdfDocument: this.getPdfDocument() })
    return executor.execute({
      region: request.region,
      ...candidate.configuration
    })
  }

  async run() {
    this.state = 'initializing'
    await Promise.resolve()
    if (this.cancelled) return Object.freeze({ status: BENCHMARK_RUNNER_STATUS.CANCELLED })

    this.state = 'planning-candidates'
    await Promise.resolve()
    if (this.cancelled) return Object.freeze({ status: BENCHMARK_RUNNER_STATUS.CANCELLED })

    const candidates = this.candidatePlanner.createCandidates({ configurations: this.configurations })
    const results = []

    for (const candidate of candidates) {
      if (this.cancelled) return Object.freeze({ status: BENCHMARK_RUNNER_STATUS.CANCELLED })

      const startedAt = this.clock()
      const operation = this.executeCandidate({ request: this.request, candidate })
      this.activeOperation = operation

      let output
      try {
        output = await operation.promise
      } catch (error) {
        if (this.cancelled) return Object.freeze({ status: BENCHMARK_RUNNER_STATUS.CANCELLED })
        throw error
      } finally {
        if (this.activeOperation === operation) this.activeOperation = null
      }

      if (this.cancelled) return Object.freeze({ status: BENCHMARK_RUNNER_STATUS.CANCELLED })

      results.push(this.resultAssembler.assemble({
        candidate,
        startedAt,
        completedAt: this.clock(),
        output
      }))
    }

    this.state = 'ready'
    return Object.freeze({
      status: BENCHMARK_RUNNER_STATUS.READY,
      candidates,
      results: Object.freeze(results)
    })
  }
}

export class BenchmarkRunner {
  constructor({
    candidatePlanner,
    configurations,
    createExecutor,
    getPdfDocument,
    clock,
    resultAssembler,
    createSession = (request) => new BenchmarkSession(request, {
      candidatePlanner,
      configurations,
      createExecutor,
      getPdfDocument,
      clock,
      resultAssembler
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
