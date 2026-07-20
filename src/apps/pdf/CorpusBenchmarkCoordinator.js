import { BrowserBenchmarkCoordinator } from '../../../benchmarks/region-ocr/browser/BrowserBenchmarkCoordinator.js'

const CANCELLED_RESULT = Object.freeze({
  candidateResults: Object.freeze([]),
  candidateFailures: Object.freeze([]),
  comparisonRuntimeResult: null,
  comparisonArtifact: null,
  cancelled: true
})

export class CorpusBenchmarkCoordinator {
  constructor({ assetLoader, candidates } = {}) {
    if (!assetLoader) throw new TypeError('CorpusBenchmarkCoordinator requires assetLoader')
    this.assetLoader = assetLoader
    this.candidates = candidates || [
      { id: 'scale-1-eng', scale: 1, language: 'eng' },
      { id: 'scale-1.5-eng', scale: 1.5, language: 'eng' }
    ]
  }

  run({ onProgress, signal } = {}) {
    let innerOperation = null
    let cancelled = false

    const cancel = () => {
      cancelled = true
      innerOperation?.cancel?.()
    }

    const promise = (async () => {
      const { corpus, assets } = await this.assetLoader.load()
      if (cancelled) return CANCELLED_RESULT

      const coordinator = new BrowserBenchmarkCoordinator({
        corpus,
        assets,
        candidates: this.candidates,
        createRunDescriptor: ({ candidate }) => ({
          runId: `corpus-${candidate.id}-${Date.now()}`
        }),
        createSampleArtifactMetadata: () => ({}),
        createScoredResultDescriptor: () => ({}),
        createComparisonResultDescriptor: () => ({
          artifactId: `corpus-comparison-${Date.now()}`
        })
      })

      const operation = coordinator.run({ onProgress, signal })
      innerOperation = operation
      const result = await operation.promise
      return result
    })()

    return Object.freeze({ promise, cancel })
  }
}
