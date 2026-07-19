export class BenchmarkResultAssembler {
  assemble({ providerId, startedAt, completedAt, output }) {
    return Object.freeze({
      providerId,
      runtime: Object.freeze({
        startedAt,
        completedAt,
        latencyMs: completedAt - startedAt
      }),
      output
    })
  }
}
