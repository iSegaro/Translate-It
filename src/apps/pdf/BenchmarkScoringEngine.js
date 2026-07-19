import { BenchmarkMetricsBuilder } from './BenchmarkMetricsBuilder.js'

export class BenchmarkScoringEngine {
  constructor({ metricsBuilder = new BenchmarkMetricsBuilder() } = {}) {
    this.metricsBuilder = metricsBuilder
  }

  score(results) {
    return Object.freeze({
      providers: Object.freeze(results.map(result => Object.freeze({
        providerId: result.providerId,
        score: null,
        metrics: this.metricsBuilder.build(result)
      }))),
      winner: null
    })
  }
}
