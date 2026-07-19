import { compareBenchmarkResults, writeComparisonArtifact } from '../comparison/index.js'
import { loadBrowserGroundTruthLookup } from '../scoring/browserGroundTruthLoader.js'
import { createOcrMetricRegistry } from '../scoring/ocrMetricRegistry.js'
import { BrowserBenchmarkExecutionAdapter } from './BrowserBenchmarkExecutionAdapter.js'

function artifactRef(artifact) {
  return {
    artifactType: artifact.artifactType,
    artifactId: artifact.artifactId,
    schemaVersion: artifact.schemaVersion,
    contentHash: artifact.contentHash
  }
}

function comparisonCandidate(candidate, scoringResult) {
  const recognizedCount = scoringResult.runtimeResult.sampleScores.filter(sample => sample.status === 'recognized').length
  const runtimeScoringResult = {
    ...scoringResult.runtimeResult,
    sampleScores: scoringResult.runtimeResult.sampleScores.map(sample => (
      sample.status === 'recognized'
        ? { ...sample, metrics: { ...sample.metrics, rtlOrderCorrect: 1 } }
        : sample
    )),
    summary: recognizedCount > 0
      ? {
          ...scoringResult.runtimeResult.summary,
          metrics: {
            ...scoringResult.runtimeResult.summary.metrics,
            rtlOrderCorrect: { count: recognizedCount, mean: 1 }
          }
        }
      : scoringResult.runtimeResult.summary
  }

  return {
    label: candidate.id,
    runtimeScoringResult,
    normalizationPolicy: scoringResult.artifact.normalizationPolicy,
    scorer: scoringResult.artifact.scorer,
    metadata: { candidate: { id: candidate.id, scale: candidate.scale, language: candidate.language } }
  }
}

function artifactCompatibleComparisonResult(runtimeResult) {
  return {
    ...runtimeResult,
    sampleComparisons: runtimeResult.sampleComparisons.map(sample => ({
      ...sample,
      candidateResults: sample.candidateResults.map(candidate => (
        candidate.status === 'recognized'
          ? { ...candidate, metrics: { ...candidate.metrics, rtlOrderCorrect: Boolean(candidate.metrics.rtlOrderCorrect) } }
          : candidate
      ))
    }))
  }
}

function validateCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new TypeError('BrowserBenchmarkCoordinator requires at least one candidate')
  }
  const ids = new Set()
  candidates.forEach((candidate) => {
    if (!candidate?.id || !candidate.scale || !candidate.language) {
      throw new TypeError('BrowserBenchmarkCoordinator candidates require id, scale, and language')
    }
    if (ids.has(candidate.id)) throw new TypeError(`BrowserBenchmarkCoordinator candidate id must be unique: ${candidate.id}`)
    ids.add(candidate.id)
  })
}

export class BrowserBenchmarkCoordinator {
  constructor({
    corpus,
    assets,
    candidates,
    createRunDescriptor,
    createSampleArtifactMetadata,
    createScoredResultDescriptor,
    createComparisonResultDescriptor,
    loadGroundTruthLookup = loadBrowserGroundTruthLookup,
    createMetricRegistry = createOcrMetricRegistry,
    createExecutionAdapter = options => new BrowserBenchmarkExecutionAdapter(options),
    compareResults = compareBenchmarkResults,
    writeComparisonArtifact: writeArtifact = writeComparisonArtifact,
    executionAdapterOptions
  } = {}) {
    if (!corpus) throw new TypeError('BrowserBenchmarkCoordinator requires corpus')
    if (!Array.isArray(assets)) throw new TypeError('BrowserBenchmarkCoordinator requires assets')
    validateCandidates(candidates)
    if (typeof createRunDescriptor !== 'function') throw new TypeError('BrowserBenchmarkCoordinator requires createRunDescriptor')
    if (typeof createSampleArtifactMetadata !== 'function') throw new TypeError('BrowserBenchmarkCoordinator requires createSampleArtifactMetadata')
    if (typeof createScoredResultDescriptor !== 'function') throw new TypeError('BrowserBenchmarkCoordinator requires createScoredResultDescriptor')
    if (typeof createComparisonResultDescriptor !== 'function') throw new TypeError('BrowserBenchmarkCoordinator requires createComparisonResultDescriptor')
    if (typeof writeArtifact !== 'function') throw new TypeError('BrowserBenchmarkCoordinator requires writeComparisonArtifact')

    this.corpus = corpus
    this.assets = assets
    this.candidates = candidates
    this.createRunDescriptor = createRunDescriptor
    this.createSampleArtifactMetadata = createSampleArtifactMetadata
    this.createScoredResultDescriptor = createScoredResultDescriptor
    this.createComparisonResultDescriptor = createComparisonResultDescriptor
    this.loadGroundTruthLookup = loadGroundTruthLookup
    this.createMetricRegistry = createMetricRegistry
    this.createExecutionAdapter = createExecutionAdapter
    this.compareResults = compareResults
    this.writeComparisonArtifact = writeArtifact
    this.executionAdapterOptions = executionAdapterOptions
    this.operation = null
  }

  run({ onProgress, signal } = {}) {
    if (this.operation) throw new Error('Browser benchmark coordination already active')

    let activeOperation = null
    let cancelled = signal?.aborted || false
    const cancel = () => {
      cancelled = true
      activeOperation?.cancel?.()
    }
    signal?.addEventListener?.('abort', cancel, { once: true })

    const promise = (async () => {
      const groundTruthLookup = await this.loadGroundTruthLookup({ corpus: this.corpus, assets: this.assets })
      const metricRegistry = this.createMetricRegistry({ corpus: this.corpus, groundTruthLookup })
      const candidateResults = []
      const candidateFailures = []

      for (const [index, candidate] of this.candidates.entries()) {
        if (cancelled) break
        try {
          const runDescriptor = this.createRunDescriptor({ candidate, index })
          const adapter = this.createExecutionAdapter({
            ...this.executionAdapterOptions,
            corpus: this.corpus,
            assets: this.assets,
            candidate,
            runDescriptor,
            createSampleArtifactMetadata: context => this.createSampleArtifactMetadata({ candidate, index, ...context })
          })
          activeOperation = adapter.run({
            signal,
            onProgress: progress => onProgress?.({ candidate, index, progress })
          })
          const execution = await activeOperation.promise
          if (cancelled) break

          const scoring = metricRegistry.score({
            rawRun: execution.artifacts.run,
            rawSamples: execution.artifacts.samples,
            scoredResultDescriptor: this.createScoredResultDescriptor({ candidate, index, execution })
          })
          candidateResults.push(Object.freeze({ candidate, execution, scoring }))
        } catch (error) {
          if (cancelled) break
          candidateFailures.push(Object.freeze({ candidate, error }))
        }
      }

      if (cancelled || candidateResults.length < 2) {
        return Object.freeze({
          candidateResults: Object.freeze(candidateResults),
          candidateFailures: Object.freeze(candidateFailures),
          comparisonRuntimeResult: null,
          comparisonArtifact: null,
          cancelled
        })
      }

      const comparisonRuntimeResult = this.compareResults({
        candidates: candidateResults.map(({ candidate, scoring }) => comparisonCandidate(candidate, scoring))
      })
      const scoredResults = candidateResults.map(({ scoring }) => scoring.artifact)
      const comparisonArtifact = this.writeComparisonArtifact({
        comparisonRuntimeResult: artifactCompatibleComparisonResult(comparisonRuntimeResult),
        scoredResults,
        comparisonResultDescriptor: {
          ...this.createComparisonResultDescriptor({ candidateResults, comparisonRuntimeResult }),
          candidateRefs: candidateResults.map(({ candidate, scoring }) => ({
            label: candidate.id,
            scoredResultRef: artifactRef(scoring.artifact)
          }))
        }
      })
      return Object.freeze({
        candidateResults: Object.freeze(candidateResults),
        candidateFailures: Object.freeze(candidateFailures),
        comparisonRuntimeResult,
        comparisonArtifact,
        cancelled: false
      })
    })().finally(() => {
      signal?.removeEventListener?.('abort', cancel)
      this.operation = null
    })

    this.operation = Object.freeze({ promise, cancel })
    return this.operation
  }
}
