import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../benchmarks/region-ocr/browser/BrowserBenchmarkCoordinator.js', () => ({
  BrowserBenchmarkCoordinator: class {
    constructor(options) {
      this.options = options
    }
    run({ onProgress, signal } = {}) {
      const cancel = vi.fn()
      const promise = Promise.resolve(Object.freeze({
        candidateResults: Object.freeze([]),
        candidateFailures: Object.freeze([]),
        comparisonRuntimeResult: null,
        comparisonArtifact: null,
        cancelled: false
      }))
      return Object.freeze({ promise, cancel })
    }
  }
}))

import { CorpusBenchmarkCoordinator } from './CorpusBenchmarkCoordinator.js'

describe('CorpusBenchmarkCoordinator', () => {
  function mockAssetLoader(result) {
    return { load: vi.fn().mockResolvedValue(result) }
  }

  it('throws if constructed without assetLoader', () => {
    expect(() => new CorpusBenchmarkCoordinator()).toThrow('CorpusBenchmarkCoordinator requires assetLoader')
  })

  it('loads corpus assets on run and delegates to BrowserBenchmarkCoordinator', async () => {
    const corpus = { corpusId: 'test-corpus' }
    const assets = [{ kind: 'document', path: 'test.pdf', bytes: new Uint8Array() }]
    const loader = mockAssetLoader({ corpus, assets })
    const coordinator = new CorpusBenchmarkCoordinator({ assetLoader: loader })

    const { promise } = coordinator.run()
    await expect(promise).resolves.toBeDefined()
    expect(loader.load).toHaveBeenCalledOnce()
  })

  it('rejects when assetLoader fails', async () => {
    const error = new Error('Network failure')
    const loader = { load: vi.fn().mockRejectedValue(error) }
    const coordinator = new CorpusBenchmarkCoordinator({ assetLoader: loader })

    const { promise } = coordinator.run()
    await expect(promise).rejects.toThrow('Network failure')
  })

  it('returns cancelled result when cancelled before assets load', async () => {
    const deferred = deferredPromise()
    const loader = { load: vi.fn(() => deferred.promise) }
    const coordinator = new CorpusBenchmarkCoordinator({ assetLoader: loader })

    const { promise, cancel } = coordinator.run()
    cancel()
    deferred.resolve({ corpus: {}, assets: [] })

    const result = await promise
    expect(result.cancelled).toBe(true)
    expect(result.candidateResults).toEqual([])
    expect(result.comparisonRuntimeResult).toBeNull()
  })

  it('returns normal result when cancel called after completion', async () => {
    const loader = { load: vi.fn().mockResolvedValue({ corpus: { corpusId: 'test' }, assets: [] }) }
    const coordinator = new CorpusBenchmarkCoordinator({ assetLoader: loader })

    const { promise, cancel } = coordinator.run()
    const result = await promise
    cancel()

    expect(result.cancelled).toBe(false)
  })
})

function deferredPromise() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
