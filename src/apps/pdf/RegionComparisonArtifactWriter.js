import { createRegionComparisonArtifact, REGION_COMPARISON_ARTIFACT_TYPE } from './RegionComparisonArtifact.js'
import { createExecutionMetadata } from './ExecutionMetadata.js'

const SCHEMA_VERSION = '1.0.0'

export class RegionComparisonArtifactWriter {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    this.clock = clock
  }

  write(sessionResult, { region, generatedAt = this.clock() } = {}) {
    return createRegionComparisonArtifact({
      schemaVersion: SCHEMA_VERSION,
      artifactType: REGION_COMPARISON_ARTIFACT_TYPE,
      generatedAt,
      metadata: createExecutionMetadata({
        startedAt: sessionResult.summary.startedAt,
        completedAt: sessionResult.summary.completedAt,
        totalElapsedMs: sessionResult.summary.totalElapsedMs,
        pageNumber: region?.pageNumber,
        region
      }),
      summary: sessionResult.summary,
      configurations: Object.freeze(sessionResult.candidates.map(candidate => Object.freeze({
        candidateId: candidate.candidateId,
        configuration: candidate.configuration
      }))),
      results: Object.freeze([...sessionResult.results])
    })
  }
}
