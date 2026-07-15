export const ARTIFACT_TYPES = Object.freeze({
  CORPUS_MANIFEST: 'corpus-manifest',
  RAW_RUN: 'raw-run',
  RAW_SAMPLE: 'raw-sample',
  SCORED_RESULT: 'scored-result',
  COMPARISON_RESULT: 'comparison-result',
  REPORT_MANIFEST: 'report-manifest'
})

export const SCHEMA_VERSIONS = Object.freeze({
  [ARTIFACT_TYPES.CORPUS_MANIFEST]: '1.0.0',
  [ARTIFACT_TYPES.RAW_RUN]: '1.0.0',
  [ARTIFACT_TYPES.RAW_SAMPLE]: '1.0.0',
  [ARTIFACT_TYPES.SCORED_RESULT]: '1.0.0',
  [ARTIFACT_TYPES.COMPARISON_RESULT]: '1.0.0',
  [ARTIFACT_TYPES.REPORT_MANIFEST]: '1.0.0'
})

export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(SCHEMA_VERSIONS).map(([artifactType, version]) => [
      artifactType,
      Object.freeze([version])
    ])
  )
)

export const RUN_MODES = Object.freeze(['cold', 'warm'])
export const SAMPLE_STATUSES = Object.freeze(['recognized', 'cancelled', 'failed', 'skipped'])
export const COMPARISON_COMPATIBILITY = Object.freeze(['compatible', 'partial', 'incompatible'])
export const REPORT_FORMATS = Object.freeze(['json', 'csv', 'markdown', 'html'])
export const DOCUMENT_TYPES = Object.freeze([
  'vector',
  'scanned',
  'mixed',
  'embedded-image',
  'rotated',
  'multilingual'
])
export const ROTATIONS = Object.freeze([0, 90, 180, 270])

export const SHA256_PATTERN = '^sha256:[a-f0-9]{64}$'
export const VERSION_PATTERN = '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$'
export const IDENTIFIER_PATTERN = '^[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?$'
export const TIMESTAMP_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$'

/**
 * Contract only. Hashing/serialization implementation belongs to a later benchmark phase.
 */
export const CONTENT_HASH_CONTRACT = Object.freeze({
  field: 'contentHash',
  algorithm: 'sha256',
  canonicalSerialization: Object.freeze({
    deterministic: true,
    excludedRootFields: Object.freeze(['contentHash']),
    nestedContentHashFieldsIncluded: true,
    artifactReferenceHashesIncluded: true,
    provenanceHashesIncluded: true,
    includeCreatedAt: true,
    includeUnknownFields: true,
    serializerVersioning: 'schema-evolution'
  })
})
