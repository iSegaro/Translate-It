export class RegionComparisonResultAssembler {
  assemble({ candidate, startedAt, completedAt, output, runtimeLanguage }) {
    return Object.freeze({
      candidateId: candidate.candidateId,
      configuration: candidate.configuration,
      runtime: Object.freeze({
        startedAt,
        completedAt,
        latencyMs: completedAt - startedAt
      }),
      output,
      runtimeLanguage
    })
  }
}
