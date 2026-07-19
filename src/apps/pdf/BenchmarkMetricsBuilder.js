export class BenchmarkMetricsBuilder {
  build(result) {
    const completed = result.status === 'completed'

    return Object.freeze({
      latencyMs: result.durationMs,
      success: completed,
      completed
    })
  }
}
