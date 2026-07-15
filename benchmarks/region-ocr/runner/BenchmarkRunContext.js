export class BenchmarkRunContext {
  #cancelled = false

  constructor({ runId, corpus, totalRegions }) {
    this.runId = runId
    this.corpus = corpus
    this.totalRegions = totalRegions
    Object.freeze(this)
  }

  get cancelled() {
    return this.#cancelled
  }

  cancel() {
    this.#cancelled = true
  }
}
