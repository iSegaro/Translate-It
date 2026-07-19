import { BenchmarkCriteriaEvaluator } from './BenchmarkCriteriaEvaluator.js'
import { BenchmarkMetricsBuilder } from './BenchmarkMetricsBuilder.js'

export class BenchmarkScoringEngine {
  constructor({
    metricsBuilder = new BenchmarkMetricsBuilder(),
    criteriaEvaluator = new BenchmarkCriteriaEvaluator()
  } = {}) {
    this.metricsBuilder = metricsBuilder
    this.criteriaEvaluator = criteriaEvaluator
  }

  score(results) {
    return Object.freeze({
      providers: Object.freeze(results.map(result => {
        const metrics = this.metricsBuilder.build(result)

        return Object.freeze({
          providerId: result.providerId,
          score: null,
          metrics,
          criteria: this.criteriaEvaluator.evaluate(metrics)
        })
      })),
      winner: null
    })
  }
}
