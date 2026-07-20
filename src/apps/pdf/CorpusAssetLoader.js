import { loadBrowserBenchmarkCorpus } from '../../../benchmarks/region-ocr/corpus/loadBrowserCorpus.js'

export class CorpusAssetLoader {
  constructor({ manifestUrl } = {}) {
    if (!manifestUrl) throw new TypeError('CorpusAssetLoader requires manifestUrl')
    this.manifestUrl = manifestUrl
    this.cached = null
    this.loading = null
  }

  async load() {
    if (this.cached) return this.cached
    if (this.loading) return this.loading

    this.loading = loadBrowserBenchmarkCorpus({ manifestUrl: this.manifestUrl })
      .then(result => {
        this.cached = result
        this.loading = null
        return result
      })
      .catch(error => {
        this.loading = null
        throw error
      })

    return this.loading
  }
}
