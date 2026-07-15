import {
  ARTIFACT_TYPES,
  SCHEMA_VERSIONS,
  SUPPORTED_SCHEMA_VERSIONS,
  VERSION_PATTERN
} from './artifactModels.js'
import { ARTIFACT_SCHEMAS, SCORE_METRICS_SCHEMA, getBenchmarkArtifactSchema } from './artifactSchemas.js'
import { validateSchemaValue } from './schemaValidator.js'

function error(code, path, message, details) {
  return details === undefined
    ? { code, path, message }
    : { code, path, message, details }
}

function validateKnownSchemaVersion(artifact, errors) {
  const { artifactType, schemaVersion } = artifact || {}
  if (typeof schemaVersion !== 'string' || !new RegExp(VERSION_PATTERN).test(schemaVersion)) return
  const supported = SUPPORTED_SCHEMA_VERSIONS[artifactType]
  if (supported && !supported.includes(schemaVersion)) {
    errors.push(error('unsupported_schema_version', '$.schemaVersion', 'Schema version is not supported', {
      artifactType,
      supported: [...supported]
    }))
  }
}

function validateReferenceType(reference, expectedTypes, path, errors) {
  if (!reference || typeof reference !== 'object') return
  if (!expectedTypes.includes(reference.artifactType)) {
    errors.push(error('incompatible_reference_type', `${path}.artifactType`, 'Reference has incompatible artifact type', {
      expected: expectedTypes,
      actual: reference.artifactType
    }))
  }
}

function validateRawSampleSemantics(artifact, errors) {
  if (artifact.status === 'recognized' && !artifact.recognition) {
    errors.push(error('missing_recognition', '$.recognition', 'Recognized samples require raw recognition output'))
  }
  if (artifact.status === 'failed' && !artifact.error) {
    errors.push(error('missing_failure', '$.error', 'Failed samples require failure information'))
  }
  if (artifact.status !== 'recognized' && artifact.recognition) {
    errors.push(error('incompatible_status_data', '$.recognition', 'Only recognized samples may include recognition output'))
  }
  if (artifact.status !== 'failed' && artifact.error) {
    errors.push(error('incompatible_status_data', '$.error', 'Only failed samples may include failure information'))
  }
}

function validateCorpusRegionSemantics(artifact, errors) {
  if (!Array.isArray(artifact.documents)) return
  artifact.documents.forEach((document, documentIndex) => {
    if (!Array.isArray(document?.regions)) return
    document.regions.forEach((region, regionIndex) => {
      const value = region.pdfRegion
      const path = `$.documents[${documentIndex}].regions[${regionIndex}].pdfRegion`
      if (
        Number.isFinite(value?.left) &&
        Number.isFinite(value?.right) &&
        value.left >= value.right
      ) {
        errors.push(error('invalid_region_bounds', path, 'PdfRegion requires left < right'))
      }
      if (
        Number.isFinite(value?.bottom) &&
        Number.isFinite(value?.top) &&
        value.bottom >= value.top
      ) {
        errors.push(error('invalid_region_bounds', path, 'PdfRegion requires bottom < top'))
      }
    })
  })
}

function validateReferenceSemantics(artifact, errors) {
  switch (artifact.artifactType) {
    case ARTIFACT_TYPES.CORPUS_MANIFEST:
      validateCorpusRegionSemantics(artifact, errors)
      break
    case ARTIFACT_TYPES.RAW_RUN:
      validateReferenceType(artifact.corpusRef, [ARTIFACT_TYPES.CORPUS_MANIFEST], '$.corpusRef', errors)
      break
    case ARTIFACT_TYPES.RAW_SAMPLE:
      validateReferenceType(artifact.runRef, [ARTIFACT_TYPES.RAW_RUN], '$.runRef', errors)
      validateReferenceType(artifact.corpusRef, [ARTIFACT_TYPES.CORPUS_MANIFEST], '$.corpusRef', errors)
      validateRawSampleSemantics(artifact, errors)
      break
    case ARTIFACT_TYPES.SCORED_RESULT:
      validateReferenceType(artifact.rawRunRef, [ARTIFACT_TYPES.RAW_RUN], '$.rawRunRef', errors)
      validateReferenceType(artifact.corpusRef, [ARTIFACT_TYPES.CORPUS_MANIFEST], '$.corpusRef', errors)
      artifact.samples?.forEach((sample, index) => {
        validateReferenceType(sample?.sampleRef, [ARTIFACT_TYPES.RAW_SAMPLE], `$.samples[${index}].sampleRef`, errors)
        validateScoredSampleSemantics(sample, `$.samples[${index}]`, errors)
      })
      break
    case ARTIFACT_TYPES.COMPARISON_RESULT:
      validateReferenceType(
        artifact.leftRef,
        [ARTIFACT_TYPES.RAW_RUN, ARTIFACT_TYPES.SCORED_RESULT],
        '$.leftRef',
        errors
      )
      validateReferenceType(
        artifact.rightRef,
        [ARTIFACT_TYPES.RAW_RUN, ARTIFACT_TYPES.SCORED_RESULT],
        '$.rightRef',
        errors
      )
      break
  }
}

function validateScoredSampleSemantics(sample, path, errors) {
  if (!sample || typeof sample !== 'object' || !sample.metrics || typeof sample.metrics !== 'object') return
  if (sample.status === 'recognized') {
    validateSchemaValue(sample.metrics, SCORE_METRICS_SCHEMA, `${path}.metrics`, errors)
    return
  }
  if (['failed', 'cancelled', 'skipped'].includes(sample.status) && Object.keys(sample.metrics).length > 0) {
    errors.push(error('incompatible_status_metrics', `${path}.metrics`, 'Only recognized samples may include metrics'))
  }
}

function sortErrors(errors) {
  return errors.sort((left, right) => (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  ))
}

export function validateBenchmarkArtifact(artifact) {
  const errors = []
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    errors.push(error('invalid_artifact', '$', 'Artifact must be an object'))
    return { valid: false, errors, value: artifact }
  }

  const schemasByVersion = ARTIFACT_SCHEMAS[artifact.artifactType]
  if (!schemasByVersion) {
    errors.push(error('unknown_artifact_type', '$.artifactType', 'Artifact type is not supported'))
    return { valid: false, errors, value: artifact }
  }

  const schema = getBenchmarkArtifactSchema(artifact.artifactType, artifact.schemaVersion)
    || getBenchmarkArtifactSchema(artifact.artifactType, SCHEMA_VERSIONS[artifact.artifactType])

  validateSchemaValue(artifact, schema, '$', errors)
  validateKnownSchemaVersion(artifact, errors)
  validateReferenceSemantics(artifact, errors)
  return { valid: errors.length === 0, errors: sortErrors(errors), value: artifact }
}

function collectReferences(artifact) {
  switch (artifact.artifactType) {
    case ARTIFACT_TYPES.RAW_RUN:
      return [artifact.corpusRef]
    case ARTIFACT_TYPES.RAW_SAMPLE:
      return [artifact.runRef, artifact.corpusRef]
    case ARTIFACT_TYPES.SCORED_RESULT:
      return [artifact.rawRunRef, artifact.corpusRef, ...(artifact.samples || []).map((sample) => sample.sampleRef)]
    case ARTIFACT_TYPES.COMPARISON_RESULT:
      return [artifact.leftRef, artifact.rightRef]
    case ARTIFACT_TYPES.REPORT_MANIFEST:
      return artifact.sourceRefs || []
    default:
      return []
  }
}

export function validateBenchmarkArtifactBundle(artifacts) {
  const values = Array.isArray(artifacts) ? artifacts : []
  const errors = []
  const byId = new Map()

  values.forEach((artifact, index) => {
    const result = validateBenchmarkArtifact(artifact)
    result.errors.forEach((item) => {
      errors.push({ ...item, path: `$[${index}]${item.path.slice(1)}` })
    })
    if (artifact?.artifactId) {
      if (byId.has(artifact.artifactId)) {
        errors.push(error('duplicate_artifact_id', `$[${index}].artifactId`, 'Artifact ID must be unique'))
      } else {
        byId.set(artifact.artifactId, artifact)
      }
    }
  })

  values.forEach((artifact, artifactIndex) => {
    collectReferences(artifact || {}).forEach((reference, referenceIndex) => {
      if (!reference?.artifactId) return
      const target = byId.get(reference.artifactId)
      const path = `$[${artifactIndex}].references[${referenceIndex}]`
      if (!target) {
        errors.push(error('unresolved_reference', path, 'Referenced artifact is not present in bundle', {
          artifactId: reference.artifactId
        }))
        return
      }
      if (
        target.artifactType !== reference.artifactType ||
        target.schemaVersion !== reference.schemaVersion ||
        target.contentHash !== reference.contentHash
      ) {
        errors.push(error('incompatible_reference', path, 'Reference metadata does not match target artifact', {
          artifactId: reference.artifactId
        }))
      }
    })
  })

  return { valid: errors.length === 0, errors: sortErrors(errors), value: artifacts }
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

export class BenchmarkArtifactValidationError extends Error {
  constructor(errors) {
    super('Benchmark artifact validation failed')
    this.name = 'BenchmarkArtifactValidationError'
    this.errors = errors
  }
}

export function finalizeBenchmarkArtifact(artifact) {
  const result = validateBenchmarkArtifact(artifact)
  if (!result.valid) throw new BenchmarkArtifactValidationError(result.errors)
  return deepFreeze(artifact)
}

export function getCurrentSchemaVersion(artifactType) {
  return SCHEMA_VERSIONS[artifactType] || null
}
