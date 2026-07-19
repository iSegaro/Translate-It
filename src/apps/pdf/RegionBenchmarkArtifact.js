export const REGION_BENCHMARK_ARTIFACT_TYPE = 'region-benchmark'

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value

  seen.add(value)
  Object.values(value).forEach(child => deepFreeze(child, seen))
  return Object.freeze(value)
}

function requireField(value, field) {
  if (!Object.hasOwn(value, field)) throw new TypeError(`RegionBenchmarkArtifact requires ${field}`)
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`RegionBenchmarkArtifact requires ${field}`)
  }
}

export function createRegionBenchmarkArtifact(value = {}) {
  for (const field of ['schemaVersion', 'artifactType', 'generatedAt', 'metadata', 'summary', 'configurations', 'results']) {
    requireField(value, field)
  }
  requireObject(value.metadata, 'metadata')
  requireObject(value.summary, 'summary')
  if (!Array.isArray(value.configurations)) throw new TypeError('RegionBenchmarkArtifact requires configurations')
  if (!Array.isArray(value.results)) throw new TypeError('RegionBenchmarkArtifact requires results')
  if (typeof value.schemaVersion !== 'string' || !value.schemaVersion) throw new TypeError('RegionBenchmarkArtifact requires schemaVersion')
  if (typeof value.artifactType !== 'string' || !value.artifactType) throw new TypeError('RegionBenchmarkArtifact requires artifactType')
  if (typeof value.generatedAt !== 'string' || !value.generatedAt) throw new TypeError('RegionBenchmarkArtifact requires generatedAt')

  return deepFreeze({
    schemaVersion: value.schemaVersion,
    artifactType: value.artifactType,
    generatedAt: value.generatedAt,
    metadata: value.metadata,
    summary: value.summary,
    configurations: [...value.configurations],
    results: [...value.results]
  })
}
