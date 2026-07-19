export class BenchmarkCriteriaEvaluator {
  evaluate(metrics) {
    return Object.freeze({
      latency: Object.freeze({ value: metrics.latencyMs, weight: null }),
      quality: Object.freeze({ value: null, weight: null }),
      cost: Object.freeze({ value: null, weight: null })
    })
  }
}
