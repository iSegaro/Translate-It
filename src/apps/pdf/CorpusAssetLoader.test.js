import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../benchmarks/region-ocr/corpus/loadBrowserCorpus.js', () => ({
  loadBrowserBenchmarkCorpus: vi.fn()
}))

import { CorpusAssetLoader } from './CorpusAssetLoader.js'
import { loadBrowserBenchmarkCorpus } from '../../../benchmarks/region-ocr/corpus/loadBrowserCorpus.js'

describe('CorpusAssetLoader', () => {
  beforeEach(() => {
    vi.mocked(loadBrowserBenchmarkCorpus).mockReset()
  })

  it('requires manifestUrl', () => {
    expect(() => new CorpusAssetLoader()).toThrow('CorpusAssetLoader requires manifestUrl')
  })

  it('loads once across sequential calls', async () => {
    const corpus = { corpusId: 'test' }
    const assets = []
    vi.mocked(loadBrowserBenchmarkCorpus).mockResolvedValue({ corpus, assets })

    const loader = new CorpusAssetLoader({ manifestUrl: 'https://example.com/corpus/manifest.json' })
    const a = await loader.load()
    const b = await loader.load()
    const c = await loader.load()

    expect(loadBrowserBenchmarkCorpus).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('shares one in-flight load across concurrent calls', async () => {
    let resolve
    const promise = new Promise(r => { resolve = r })
    vi.mocked(loadBrowserBenchmarkCorpus).mockReturnValue(promise)

    const loader = new CorpusAssetLoader({ manifestUrl: 'https://example.com/corpus/manifest.json' })
    const callA = loader.load()
    const callB = loader.load()

    resolve({ corpus: {}, assets: [] })
    const [a, b] = await Promise.all([callA, callB])

    expect(loadBrowserBenchmarkCorpus).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('retries after failed load', async () => {
    vi.mocked(loadBrowserBenchmarkCorpus)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ corpus: { corpusId: 'ok' }, assets: [] })

    const loader = new CorpusAssetLoader({ manifestUrl: 'https://example.com/corpus/manifest.json' })

    await expect(loader.load()).rejects.toThrow('Network error')
    expect(loadBrowserBenchmarkCorpus).toHaveBeenCalledTimes(1)

    const result = await loader.load()
    expect(loadBrowserBenchmarkCorpus).toHaveBeenCalledTimes(2)
    expect(result.corpus.corpusId).toBe('ok')
  })
})
