import { describe, expect, it } from 'vitest'
import { createRegionBenchmarkArtifact, REGION_BENCHMARK_ARTIFACT_TYPE } from './RegionBenchmarkArtifact.js'

function createValidArtifact(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    artifactType: REGION_BENCHMARK_ARTIFACT_TYPE,
    generatedAt: '2026-07-19T00:00:00.000Z',
    profile: { id: 'default', name: 'Default' },
    metadata: { startedAt: 0, completedAt: 1, totalElapsedMs: 1, profileId: 'default', pageNumber: 1, region: {} },
    summary: { totalCandidates: 1 },
    configurations: [{ candidateId: 'scale-1-eng', configuration: { scale: 1, language: 'eng' } }],
    results: [{ candidateId: 'scale-1-eng', evaluation: { cer: { characterErrorRate: 0 } } }],
    ...overrides
  }
}

describe('RegionBenchmarkArtifact', () => {
  it('creates immutable canonical artifacts without changing evaluation', () => {
    const evaluation = Object.freeze({ cer: Object.freeze({ characterErrorRate: 0 }) })
    const artifact = createRegionBenchmarkArtifact(createValidArtifact({
      results: [{ candidateId: 'scale-1-eng', evaluation }]
    }))

    expect(artifact.artifactType).toBe(REGION_BENCHMARK_ARTIFACT_TYPE)
    expect(artifact.results[0].evaluation).toBe(evaluation)
    expect(Object.isFrozen(artifact)).toBe(true)
    expect(Object.isFrozen(artifact.profile)).toBe(true)
    expect(Object.isFrozen(artifact.results)).toBe(true)
    expect(Object.isFrozen(artifact.results[0])).toBe(true)
  })

  it.each(['schemaVersion', 'artifactType', 'generatedAt', 'profile', 'metadata', 'summary', 'configurations', 'results'])('rejects missing %s', field => {
    const artifact = createValidArtifact()
    delete artifact[field]

    expect(() => createRegionBenchmarkArtifact(artifact)).toThrow(`RegionBenchmarkArtifact requires ${field}`)
  })
})
