export class RegionComparisonResultAssembler {
  assemble({ candidate, startedAt, completedAt, output }) {
    return Object.freeze({
      candidateId: candidate.candidateId,
      configuration: candidate.configuration,
      runtime: Object.freeze({
        startedAt,
        completedAt,
        latencyMs: completedAt - startedAt
      }),
      output
    })
  }
}
