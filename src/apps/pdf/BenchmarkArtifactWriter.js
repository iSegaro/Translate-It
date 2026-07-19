import { createRegionBenchmarkArtifact, REGION_BENCHMARK_ARTIFACT_TYPE } from './RegionBenchmarkArtifact.js'

const SCHEMA_VERSION = '1.0.0'

export class BenchmarkArtifactWriter {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    this.clock = clock
  }

  write(sessionResult, { profile, generatedAt = this.clock() } = {}) {
    return createRegionBenchmarkArtifact({
      schemaVersion: SCHEMA_VERSION,
      artifactType: REGION_BENCHMARK_ARTIFACT_TYPE,
      generatedAt,
      profile,
      summary: sessionResult.summary,
      configurations: Object.freeze(sessionResult.candidates.map(candidate => Object.freeze({
        candidateId: candidate.candidateId,
        configuration: candidate.configuration
      }))),
      results: Object.freeze([...sessionResult.results])
    })
  }
}
