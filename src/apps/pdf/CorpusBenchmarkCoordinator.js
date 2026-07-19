import { BrowserBenchmarkCoordinator } from '../../benchmarks/region-ocr/browser/BrowserBenchmarkCoordinator.js'

export class CorpusBenchmarkCoordinator {
  constructor({ corpus, assets, candidates } = {}) {
    this.corpus = corpus || null
    this.assets = assets || []
    this.candidates = candidates || [
      { id: 'scale-1-eng', scale: 1, language: 'eng' },
      { id: 'scale-1.5-eng', scale: 1.5, language: 'eng' }
    ]
  }

  run({ onProgress, signal } = {}) {
    if (!this.corpus || !this.assets.length) {
      return Object.freeze({
        promise: Promise.reject(
          new Error('Corpus OCR Benchmark requires packaged corpus assets. See build configuration.')
        ),
        cancel: () => {}
      })
    }

    const coordinator = new BrowserBenchmarkCoordinator({
      corpus: this.corpus,
      assets: this.assets,
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

    return Object.freeze(coordinator.run({ onProgress, signal }))
  }
}
