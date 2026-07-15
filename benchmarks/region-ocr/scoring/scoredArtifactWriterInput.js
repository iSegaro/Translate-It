import {
  IDENTIFIER_PATTERN,
  SCORE_METRICS_SCHEMA,
  SHA256_PATTERN,
  TIMESTAMP_PATTERN,
  VERSION_PATTERN,
  validateBenchmarkArtifact
} from '../schemas/index.js'
import { validateSchemaValue } from '../schemas/schemaValidator.js'

function error(code, path, message, details) {
  return details === undefined
    ? { code, path, message }
    : { code, path, message, details }
}

function sortErrors(errors) {
  return errors.sort((left, right) => (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  ))
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

function matches(pattern, value) {
  return typeof value === 'string' && new RegExp(pattern).test(value)
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

function validateDescriptor(descriptor, errors) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    errors.push(error('invalid_descriptor', '$.scoredResultDescriptor', 'Descriptor must be an object'))
    return
  }
  for (const field of ['artifactId', 'contentHash', 'createdAt', 'scoredResultId', 'normalizationPolicy', 'scorer']) {
    if (!Object.hasOwn(descriptor, field)) {
      errors.push(error('missing_required_field', `$.scoredResultDescriptor.${field}`, 'Required field is missing'))
    }
  }
  for (const field of ['rawRunRef', 'sampleRefs', 'corpusRef']) {
    if (Object.hasOwn(descriptor, field)) {
      errors.push(error('forbidden_field', `$.scoredResultDescriptor.${field}`, `Writer derives ${field}`))
    }
  }

  if (!matches(IDENTIFIER_PATTERN, descriptor.artifactId)) {
    errors.push(error('invalid_identifier', '$.scoredResultDescriptor.artifactId', 'Artifact ID must be a valid benchmark identifier'))
  }
  if (!matches(SHA256_PATTERN, descriptor.contentHash)) {
    errors.push(error('invalid_hash', '$.scoredResultDescriptor.contentHash', 'Content hash must be a sha256 hash'))
  }
  if (!isValidTimestamp(descriptor.createdAt)) {
    errors.push(error('invalid_timestamp', '$.scoredResultDescriptor.createdAt', 'Created timestamp must be valid'))
  }
  if (!matches(IDENTIFIER_PATTERN, descriptor.scoredResultId)) {
    errors.push(error('invalid_identifier', '$.scoredResultDescriptor.scoredResultId', 'Scored result id must be valid'))
  }
  if (!descriptor.normalizationPolicy || typeof descriptor.normalizationPolicy !== 'object') {
    errors.push(error('invalid_object', '$.scoredResultDescriptor.normalizationPolicy', 'Normalization policy must be an object'))
  } else {
    if (!matches(IDENTIFIER_PATTERN, descriptor.normalizationPolicy.id)) {
      errors.push(error('invalid_identifier', '$.scoredResultDescriptor.normalizationPolicy.id', 'Normalization policy id must be valid'))
    }
    if (!matches(VERSION_PATTERN, descriptor.normalizationPolicy.version)) {
      errors.push(error('invalid_version', '$.scoredResultDescriptor.normalizationPolicy.version', 'Normalization policy version must be valid'))
    }
  }
  if (!descriptor.scorer || typeof descriptor.scorer !== 'object') {
    errors.push(error('invalid_object', '$.scoredResultDescriptor.scorer', 'Scorer must be an object'))
  } else {
    if (!matches(IDENTIFIER_PATTERN, descriptor.scorer.id)) {
      errors.push(error('invalid_identifier', '$.scoredResultDescriptor.scorer.id', 'Scorer id must be valid'))
    }
    if (!matches(VERSION_PATTERN, descriptor.scorer.version)) {
      errors.push(error('invalid_version', '$.scoredResultDescriptor.scorer.version', 'Scorer version must be valid'))
    }
  }
}

function executionIdentity(value) {
  return `${value?.documentId || ''}\u0000${value?.regionId || ''}`
}

function rawSampleIdentity(value) {
  return `${value?.caseRef?.documentId || ''}\u0000${value?.caseRef?.regionId || ''}`
}

function canonicalSerialize(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`
}

function policyMatches(left, right) {
  return left?.id === right?.id &&
    left?.version === right?.version &&
    canonicalSerialize(left?.parameters || {}) === canonicalSerialize(right?.parameters || {})
}

function artifactReferencesMatch(left, right) {
  return left?.artifactType === right?.artifactType &&
    left?.artifactId === right?.artifactId &&
    left?.schemaVersion === right?.schemaVersion &&
    left?.contentHash === right?.contentHash
}

function validateRuntimeScoreMetrics(sampleScore, path, errors) {
  const metrics = sampleScore?.metrics
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    errors.push(error('incompatible_scored_metrics', path, 'Runtime metrics must be persistable as SCORED_RESULT metrics'))
    return
  }

  if (sampleScore.status !== 'recognized') {
    if (Object.keys(metrics).length > 0) {
      errors.push(error('incompatible_scored_metrics', path, 'Non-recognized samples must have empty metrics'))
    }
    return
  }

  const metricErrors = []
  validateSchemaValue(metrics, SCORE_METRICS_SCHEMA, path, metricErrors)
  if (metricErrors.length > 0) {
    errors.push(error('incompatible_scored_metrics', path, 'Recognized sample metrics must match SCORED_RESULT metric requirements'))
  }
}

function validateRawRun(rawRun, errors) {
  if (!rawRun || typeof rawRun !== 'object' || Array.isArray(rawRun)) {
    errors.push(error('invalid_artifact', '$.rawRun', 'Artifact must be an object'))
    return false
  }
  if (rawRun.artifactType !== 'raw-run') {
    errors.push(error('invalid_artifact_type', '$.rawRun.artifactType', 'RAW run artifactType must be RAW_RUN'))
    return false
  }
  const result = validateBenchmarkArtifact(rawRun)
  if (result.valid) return true
  result.errors.forEach((item) => {
    errors.push({ ...item, path: `$.rawRun${item.path.slice(1)}` })
  })
  return false
}

function validateRawSamples(rawSamples, rawRun, rawRunValid, runtimeScoringResult, errors) {
  if (!Array.isArray(rawSamples)) {
    errors.push(error('invalid_array', '$.rawSamples', 'RAW samples must be an array'))
    return
  }
  if (!runtimeScoringResult || typeof runtimeScoringResult !== 'object') {
    errors.push(error('invalid_object', '$.runtimeScoringResult', 'Runtime scoring result must be an object'))
    return
  }
  if (!Array.isArray(runtimeScoringResult.sampleScores)) {
    errors.push(error('invalid_array', '$.runtimeScoringResult.sampleScores', 'Runtime scoring result requires sampleScores array'))
    return
  }
  if (rawSamples.length !== runtimeScoringResult.sampleScores.length) {
    errors.push(error('sample_count_mismatch', '$.rawSamples', 'RAW sample count must match runtime sample score count', {
      expected: runtimeScoringResult.sampleScores.length,
      received: rawSamples.length
    }))
  }

  rawSamples.forEach((sample, index) => {
    const validation = validateBenchmarkArtifact(sample)
    validation.errors.forEach((item) => {
      errors.push({ ...item, path: `$.rawSamples[${index}]${item.path.slice(1)}` })
    })
    if (sample?.artifactType !== 'raw-sample') {
      errors.push(error('invalid_raw_sample', `$.rawSamples[${index}].artifactType`, 'RAW sample artifactType must be RAW_SAMPLE'))
    }
  })

  const seen = new Map()
  const artifactIds = new Map()
  const sampleIds = new Map()
  const byIdentity = new Map()
  rawSamples.forEach((sample, index) => {
    if (!sample?.artifactId) {
      errors.push(error('missing_required_field', `$.rawSamples[${index}].artifactId`, 'RAW sample requires artifactId'))
    }
    const key = rawSampleIdentity(sample)
    if (seen.has(key)) {
      errors.push(error('duplicate_raw_sample_identity', `$.rawSamples[${index}]`, 'RAW sample identity must be unique', {
        firstPath: seen.get(key)
      }))
    } else {
      seen.set(key, `$.rawSamples[${index}]`)
      byIdentity.set(key, sample)
    }

    if (sample.artifactId && artifactIds.has(sample.artifactId)) {
      errors.push(error('duplicate_artifact_id', `$.rawSamples[${index}].artifactId`, 'RAW sample artifactId must be unique', {
        firstPath: artifactIds.get(sample.artifactId)
      }))
    } else if (sample.artifactId) {
      artifactIds.set(sample.artifactId, `$.rawSamples[${index}].artifactId`)
    }
    if (sample.sampleId && sampleIds.has(sample.sampleId)) {
      errors.push(error('duplicate_sample_id', `$.rawSamples[${index}].sampleId`, 'RAW sample sampleId must be unique', {
        firstPath: sampleIds.get(sample.sampleId)
      }))
    } else if (sample.sampleId) {
      sampleIds.set(sample.sampleId, `$.rawSamples[${index}].sampleId`)
    }

    if (rawRunValid && !artifactReferencesMatch(sample.runRef, rawRun)) {
      errors.push(error('incompatible_run_reference', `$.rawSamples[${index}].runRef`, 'RAW sample runRef must match RAW_RUN'))
    }
    if (rawRunValid && !artifactReferencesMatch(sample.corpusRef, rawRun.corpusRef)) {
      errors.push(error('incompatible_corpus_reference', `$.rawSamples[${index}].corpusRef`, 'RAW sample corpusRef must match RAW_RUN corpusRef'))
    }
    if (rawRunValid && !policyMatches(sample.policy, rawRun.policy)) {
      errors.push(error('incompatible_policy', `$.rawSamples[${index}].policy`, 'RAW sample policy must match RAW_RUN policy'))
    }
  })

  runtimeScoringResult.sampleScores.forEach((sampleScore, index) => {
    validateRuntimeScoreMetrics(sampleScore, `$.runtimeScoringResult.sampleScores[${index}].metrics`, errors)

    const rawSample = byIdentity.get(executionIdentity(sampleScore))
    if (!rawSample) {
      errors.push(error('runtime_artifact_identity_mismatch', `$.runtimeScoringResult.sampleScores[${index}]`, 'Runtime scoring result must match RAW sample identity', {
        expected: null,
        received: {
          documentId: sampleScore.documentId,
          regionId: sampleScore.regionId
        }
      }))
      return
    }
    if (sampleScore.status !== rawSample.status) {
      errors.push(error('sample_status_mismatch', `$.runtimeScoringResult.sampleScores[${index}].status`, 'Sample status must match RAW sample status', {
        expected: rawSample.status,
        received: sampleScore.status
      }))
    }
  })
}

function validateDescriptorConsistency(input, errors) {
  if (!input?.runtimeScoringResult || !input?.scoredResultDescriptor) return
  if (!policyMatches(input.runtimeScoringResult.normalizationPolicy, input.scoredResultDescriptor.normalizationPolicy)) {
    errors.push(error('normalization_policy_mismatch', '$.runtimeScoringResult.normalizationPolicy', 'Normalization policy must match descriptor', {
      expected: input.scoredResultDescriptor.normalizationPolicy,
      received: input.runtimeScoringResult.normalizationPolicy
    }))
  }
  if (!policyMatches(input.runtimeScoringResult.scorer, input.scoredResultDescriptor.scorer)) {
    errors.push(error('scorer_mismatch', '$.runtimeScoringResult.scorer', 'Scorer must match descriptor', {
      expected: input.scoredResultDescriptor.scorer,
      received: input.runtimeScoringResult.scorer
    }))
  }
}

function validateOrdering(rawSamples, runtimeScoringResult, errors) {
  if (!Array.isArray(rawSamples) || !runtimeScoringResult || !Array.isArray(runtimeScoringResult.sampleScores)) return
  rawSamples.forEach((rawSample, index) => {
    const sampleScore = runtimeScoringResult.sampleScores[index]
    if (!rawSample || !sampleScore) return
    if (rawSampleIdentity(rawSample) !== executionIdentity(sampleScore)) {
      errors.push(error('sample_order_mismatch', `$.runtimeScoringResult.sampleScores[${index}]`, 'Runtime sample order must match RAW sample order', {
        expected: {
          documentId: rawSample.caseRef?.documentId,
          regionId: rawSample.caseRef?.regionId
        },
        received: {
          documentId: sampleScore.documentId,
          regionId: sampleScore.regionId
        }
      }))
    }
  })
}

export class ScoredArtifactWriterInputValidationError extends Error {
  constructor(errors) {
    super('Scored artifact writer input validation failed')
    this.name = 'ScoredArtifactWriterInputValidationError'
    this.errors = errors
  }
}

export function createScoredResultDescriptor(input = {}) {
  return { ...input }
}

export function validateScoredArtifactWriterInput(input) {
  const errors = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errors.push(error('invalid_input', '$', 'Writer input must be an object'))
    return { valid: false, errors, value: input }
  }

  validateDescriptor(input.scoredResultDescriptor, errors)
  const rawRunValid = validateRawRun(input.rawRun, errors)
  validateRawSamples(input.rawSamples, input.rawRun, rawRunValid, input.runtimeScoringResult, errors)
  validateDescriptorConsistency(input, errors)
  validateOrdering(input.rawSamples, input.runtimeScoringResult, errors)

  return { valid: errors.length === 0, errors: sortErrors(errors), value: input }
}

export function finalizeScoredArtifactWriterInput(input) {
  const result = validateScoredArtifactWriterInput(input)
  if (!result.valid) throw new ScoredArtifactWriterInputValidationError(result.errors)
  return deepFreeze(input)
}
