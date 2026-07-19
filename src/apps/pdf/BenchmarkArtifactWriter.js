const SCHEMA_VERSION = '1.0.0'
const ARTIFACT_TYPE = 'region-benchmark'

export class BenchmarkArtifactWriter {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    this.clock = clock
  }

  write(sessionResult, { generatedAt = this.clock() } = {}) {
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      artifactType: ARTIFACT_TYPE,
      generatedAt,
      summary: sessionResult.summary,
      configurations: Object.freeze(sessionResult.candidates.map(candidate => Object.freeze({
        candidateId: candidate.candidateId,
        configuration: candidate.configuration
      }))),
      results: Object.freeze([...sessionResult.results])
    })
  }
}
