export class BenchmarkScoringEngine {
  score(results) {
    return Object.freeze({
      providers: Object.freeze(results.map(({ providerId }) => Object.freeze({ providerId, score: null }))),
      winner: null
    })
  }
}
