import { createExecutionOperation } from './composables/executionOperation.js'
import { isRegionExecutionRequest, REGION_EXECUTION_TARGET } from './composables/regionExecutionRequest.js'
import { BenchmarkCandidatePlanner } from './BenchmarkCandidatePlanner.js'
import { BenchmarkEvaluator } from './BenchmarkEvaluator.js'
import { BenchmarkResultAssembler } from './BenchmarkResultAssembler.js'
import { PdfRegionOcrExecutor } from '@/features/pdf-translation/core/PdfRegionOcrExecutor.js'

export const BENCHMARK_RUNNER_STATUS = Object.freeze({
  READY: 'ready',
  CANCELLED: 'cancelled'
})

function createProgress({ status, candidates, results, currentCandidate = null }) {
  return Object.freeze({
    status,
    totalCandidates: candidates.length,
    completedCandidates: results.length,
    currentCandidate
  })
}

function createSessionResult({ status, candidates, results, startedAt, completedAt }) {
  return Object.freeze({
    status,
    candidates,
    results: Object.freeze([...results]),
    summary: Object.freeze({
      totalCandidates: candidates.length,
      completedCandidates: results.length,
      startedAt,
      completedAt,
      totalElapsedMs: completedAt - startedAt
    })
  })
}

export class BenchmarkSession {
  constructor(request, {
    candidatePlanner = new BenchmarkCandidatePlanner(),
    configurations = Object.freeze([]),
    createExecutor = (options) => new PdfRegionOcrExecutor(options),
    getPdfDocument = () => undefined,
    clock = () => Date.now(),
    resultAssembler = new BenchmarkResultAssembler(),
    benchmarkEvaluator = new BenchmarkEvaluator(),
    groundTruth,
    onProgress
  } = {}) {
    this.request = request
    this.candidatePlanner = candidatePlanner
    this.configurations = configurations
    this.createExecutor = createExecutor
    this.getPdfDocument = getPdfDocument
    this.clock = clock
    this.resultAssembler = resultAssembler
    this.benchmarkEvaluator = benchmarkEvaluator
    this.groundTruth = groundTruth
    this.onProgress = onProgress
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

  emitProgress(status, candidates, results, currentCandidate) {
    this.onProgress?.(createProgress({ status, candidates, results, currentCandidate }))
  }

  finish(status, candidates, results, startedAt) {
    const completedAt = this.clock()
    this.emitProgress(status === BENCHMARK_RUNNER_STATUS.CANCELLED ? 'cancelled' : 'completed', candidates, results)
    return createSessionResult({ status, candidates, results, startedAt, completedAt })
  }

  async run() {
    const benchmarkStartedAt = this.clock()
    const emptyCandidates = Object.freeze([])
    const results = []
    this.state = 'initializing'
    await Promise.resolve()
    if (this.cancelled) return this.finish(BENCHMARK_RUNNER_STATUS.CANCELLED, emptyCandidates, results, benchmarkStartedAt)

    this.state = 'planning-candidates'
    await Promise.resolve()
    if (this.cancelled) return this.finish(BENCHMARK_RUNNER_STATUS.CANCELLED, emptyCandidates, results, benchmarkStartedAt)

    const candidates = this.candidatePlanner.createCandidates({ configurations: this.configurations })

    for (const candidate of candidates) {
      if (this.cancelled) return this.finish(BENCHMARK_RUNNER_STATUS.CANCELLED, candidates, results, benchmarkStartedAt)

      this.emitProgress('running', candidates, results, candidate)
      const candidateStartedAt = this.clock()
      const operation = this.executeCandidate({ request: this.request, candidate })
      this.activeOperation = operation

      let output
      try {
        output = await operation.promise
      } catch (error) {
        if (this.cancelled) return this.finish(BENCHMARK_RUNNER_STATUS.CANCELLED, candidates, results, benchmarkStartedAt)
        throw error
      } finally {
        if (this.activeOperation === operation) this.activeOperation = null
      }

      if (this.cancelled) return this.finish(BENCHMARK_RUNNER_STATUS.CANCELLED, candidates, results, benchmarkStartedAt)

      results.push(this.resultAssembler.assemble({
        candidate,
        startedAt: candidateStartedAt,
        completedAt: this.clock(),
        output
      }))
      this.emitProgress('running', candidates, results)
    }

    const completedResults = Object.freeze(results)
    const evaluatedResults = typeof this.groundTruth === 'string'
      ? this.benchmarkEvaluator.evaluate(completedResults, { groundTruth: this.groundTruth })
      : completedResults

    this.state = 'ready'
    return this.finish(BENCHMARK_RUNNER_STATUS.READY, candidates, evaluatedResults, benchmarkStartedAt)
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
    benchmarkEvaluator,
    groundTruth,
    onProgress,
    createSession = (request) => new BenchmarkSession(request, {
      candidatePlanner,
      configurations,
      createExecutor,
      getPdfDocument,
      clock,
      resultAssembler,
      benchmarkEvaluator,
      groundTruth,
      onProgress
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
