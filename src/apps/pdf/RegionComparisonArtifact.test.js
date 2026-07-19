import { describe, expect, it } from 'vitest'
import { createRegionComparisonArtifact, REGION_COMPARISON_ARTIFACT_TYPE } from './RegionComparisonArtifact.js'

function createValidArtifact(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    artifactType: REGION_COMPARISON_ARTIFACT_TYPE,
    generatedAt: '2026-07-19T00:00:00.000Z',
    metadata: { startedAt: 0, completedAt: 1, totalElapsedMs: 1, pageNumber: 1, region: {} },
    summary: { totalCandidates: 1 },
    configurations: [{ candidateId: 'scale-1-eng', configuration: { scale: 1, language: 'eng' } }],
    results: [{ candidateId: 'scale-1-eng', evaluation: { cer: { characterErrorRate: 0 } } }],
    ...overrides
  }
}

describe('RegionComparisonArtifact', () => {
  it('creates immutable canonical artifacts without changing evaluation', () => {
    const evaluation = Object.freeze({ cer: Object.freeze({ characterErrorRate: 0 }) })
    const artifact = createRegionComparisonArtifact(createValidArtifact({
      results: [{ candidateId: 'scale-1-eng', evaluation }]
    }))

    expect(artifact.artifactType).toBe(REGION_COMPARISON_ARTIFACT_TYPE)
    expect(artifact.results[0].evaluation).toBe(evaluation)
    expect(Object.isFrozen(artifact)).toBe(true)
    expect(Object.isFrozen(artifact.results)).toBe(true)
    expect(Object.isFrozen(artifact.results[0])).toBe(true)
  })

  it.each(['schemaVersion', 'artifactType', 'generatedAt', 'metadata', 'summary', 'configurations', 'results'])('rejects missing %s', field => {
    const artifact = createValidArtifact()
    delete artifact[field]

    expect(() => createRegionComparisonArtifact(artifact)).toThrow(`RegionComparisonArtifact requires ${field}`)
  })
})
