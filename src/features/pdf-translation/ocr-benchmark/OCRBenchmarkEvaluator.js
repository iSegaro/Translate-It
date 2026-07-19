export class OCRBenchmarkEvaluator {
  evaluate(results) {
    return Object.freeze(results.map(result => Object.freeze({
      providerId: result.providerId,
      result
    })))
  }
}
