import {
  ARTIFACT_TYPES,
  SCHEMA_VERSIONS,
  SUPPORTED_SCHEMA_VERSIONS,
  TIMESTAMP_PATTERN,
  VERSION_PATTERN
} from './artifactModels.js'
import { ARTIFACT_SCHEMAS, getBenchmarkArtifactSchema } from './artifactSchemas.js'

function error(code, path, message, details) {
  return details === undefined
    ? { code, path, message }
    : { code, path, message, details }
}

function valueType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (Number.isInteger(value)) return 'integer'
  return typeof value
}

function acceptsType(schemaType, actualType) {
  const allowed = Array.isArray(schemaType) ? schemaType : [schemaType]
  return allowed.some((expected) => (
    expected === actualType || (expected === 'number' && actualType === 'integer')
  ))
}

function getPathValue(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value)
}

function uniqueKey(value, uniqueBy) {
  const paths = Array.isArray(uniqueBy) ? uniqueBy : [uniqueBy]
  return JSON.stringify(paths.map((path) => getPathValue(value, path)))
}

function isValidTimestamp(value) {
  const match = new RegExp(TIMESTAMP_PATTERN).exec(value)
  if (!match || !Number.isFinite(Date.parse(value))) return false

  const [date, time] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute, second] = time.slice(0, 8).split(':').map(Number)
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day >= 1 && day <= daysInMonth
}

function isSafeRelativePath(value) {
  if (!value || value.startsWith('/') || value.startsWith('\\')) return false
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.includes('\\')) return false
  return !value.split('/').some((segment) => segment === '..' || segment === '')
}

function validateSchemaValue(value, schema, path, errors) {
  const actualType = valueType(value)
  if (schema.type && !acceptsType(schema.type, actualType)) {
    errors.push(error('invalid_type', path, `Expected ${[].concat(schema.type).join(' or ')}`, {
      actual: actualType
    }))
    return
  }

  if ('const' in schema && value !== schema.const) {
    errors.push(error('invalid_const', path, `Expected ${JSON.stringify(schema.const)}`))
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(error('invalid_enum', path, 'Value is not in the allowed enum', {
      allowed: [...schema.enum]
    }))
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(error('string_too_short', path, `Minimum length is ${schema.minLength}`))
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(error('invalid_pattern', path, 'Value does not match required pattern'))
    }
    if (schema.format === 'timestamp' && !isValidTimestamp(value)) {
      errors.push(error('invalid_timestamp', path, 'Value must be a valid UTC RFC 3339 timestamp'))
    }
    if (schema.format === 'relative-path' && !isSafeRelativePath(value)) {
      errors.push(error('invalid_relative_path', path, 'Value must be a safe relative path'))
    }
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      errors.push(error('non_finite_number', path, 'Value must be finite'))
    } else if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(error('number_below_minimum', path, `Minimum value is ${schema.minimum}`))
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(error('array_too_short', path, `Minimum item count is ${schema.minItems}`))
    }
    if (schema.uniqueItems) {
      const seen = new Set()
      value.forEach((item, index) => {
        const key = JSON.stringify(item)
        if (seen.has(key)) {
          errors.push(error('duplicate_value', `${path}[${index}]`, 'Array values must be unique'))
        }
        seen.add(key)
      })
    }
    if (schema.uniqueBy) {
      const seen = new Set()
      value.forEach((item, index) => {
        const key = uniqueKey(item, schema.uniqueBy)
        if (seen.has(key)) {
          errors.push(error('duplicate_identifier', `${path}[${index}]`, 'Identifier must be unique', {
            fields: [].concat(schema.uniqueBy)
          }))
        }
        seen.add(key)
      })
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchemaValue(item, schema.items, `${path}[${index}]`, errors))
    }
  }

  if (value && actualType === 'object') {
    const keys = Object.keys(value)
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      errors.push(error('object_too_small', path, `Minimum property count is ${schema.minProperties}`))
    }
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(error('missing_required_field', `${path}.${required}`, 'Required field is missing'))
      }
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) {
        validateSchemaValue(value[key], child, `${path}.${key}`, errors)
      }
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const key of keys) {
        if (!Object.hasOwn(schema.properties || {}, key)) {
          validateSchemaValue(value[key], schema.additionalProperties, `${path}.${key}`, errors)
        }
      }
    }
    if (schema.format === 'pdf-region') {
      if (
        Number.isFinite(value.left) &&
        Number.isFinite(value.right) &&
        value.left >= value.right
      ) {
        errors.push(error('invalid_region_bounds', path, 'PdfRegion requires left < right'))
      }
      if (
        Number.isFinite(value.bottom) &&
        Number.isFinite(value.top) &&
        value.bottom >= value.top
      ) {
        errors.push(error('invalid_region_bounds', path, 'PdfRegion requires bottom < top'))
      }
    }
  }
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

function validateReferenceSemantics(artifact, errors) {
  switch (artifact.artifactType) {
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
