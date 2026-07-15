import {
  IDENTIFIER_PATTERN,
  RUN_MODES,
  SHA256_PATTERN,
  TIMESTAMP_PATTERN,
  VERSION_PATTERN
} from '../schemas/index.js'
import { RegionExecutionStatus, validateRegionExecutionResult } from '../execution-results/index.js'

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

function matches(pattern, value) {
  return typeof value === 'string' && new RegExp(pattern).test(value)
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
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

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

function validateIdentifier(value, path, errors) {
  if (!matches(IDENTIFIER_PATTERN, value)) {
    errors.push(error('invalid_identifier', path, 'Value must be a valid benchmark identifier'))
  }
}

function validateHash(value, path, errors) {
  if (!matches(SHA256_PATTERN, value)) {
    errors.push(error('invalid_hash', path, 'Value must be a sha256 content hash'))
  }
}

function validateRequiredObject(value, path, errors) {
  if (!isObject(value)) {
    errors.push(error('invalid_object', path, 'Value must be an object'))
  }
}

function validateVersionedDescriptor(value, path, errors) {
  validateRequiredObject(value, path, errors)
  if (!isObject(value)) return
  validateIdentifier(value.id, `${path}.id`, errors)
  if (!matches(VERSION_PATTERN, value.version)) {
    errors.push(error('invalid_version', `${path}.version`, 'Value must be a semantic version'))
  }
}

function executionIdentity(value) {
  return `${value?.documentId || ''}\u0000${value?.regionId || ''}`
}

function validateRunResult(runResult, errors) {
  validateRequiredObject(runResult, '$.runResult', errors)
  if (!isObject(runResult)) return new Map()

  const regionResults = Array.isArray(runResult.regionResults) ? runResult.regionResults : []
  if (!Array.isArray(runResult.regionResults)) {
    errors.push(error('invalid_array', '$.runResult.regionResults', 'Value must be an array'))
  }

  const counters = [
    'totalRegions',
    'recognizedRegions',
    'failedRegions',
    'skippedRegions',
    'cancelledRegions',
    'runCancelledRegions',
    'unscheduledRegions'
  ]
  counters.forEach((field) => {
    if (!Number.isInteger(runResult[field]) || runResult[field] < 0) {
      errors.push(error('invalid_counter', `$.runResult.${field}`, 'Counter must be a non-negative integer'))
    }
  })

  const summaryTotal = counters.slice(1).reduce((sum, field) => sum + (Number.isInteger(runResult[field]) ? runResult[field] : 0), 0)
  if (Number.isInteger(runResult.totalRegions) && summaryTotal !== runResult.totalRegions) {
    errors.push(error('accounting_invariant_failed', '$.runResult', 'Execution summary counters must equal totalRegions', {
      expected: runResult.totalRegions,
      received: summaryTotal
    }))
  }

  const counts = {
    [RegionExecutionStatus.RECOGNIZED]: 0,
    [RegionExecutionStatus.FAILED]: 0,
    [RegionExecutionStatus.SKIPPED]: 0,
    [RegionExecutionStatus.CANCELLED]: 0
  }
  const byIdentity = new Map()
  regionResults.forEach((result, index) => {
    const validation = validateRegionExecutionResult(result)
    validation.errors.forEach((item) => errors.push({ ...item, path: `$.runResult.regionResults[${index}]${item.path.slice(1)}` }))
    if (RegionExecutionStatus[result?.status?.toUpperCase?.()] || Object.hasOwn(counts, result?.status)) {
      counts[result.status] += 1
    }
    const key = executionIdentity(result)
    if (byIdentity.has(key)) {
      errors.push(error('duplicate_execution_identity', `$.runResult.regionResults[${index}]`, 'Execution identity must be unique', {
        firstPath: byIdentity.get(key)
      }))
      return
    }
    byIdentity.set(key, { result, index, path: `$.runResult.regionResults[${index}]` })
  })

  const expectedCounts = {
    recognizedRegions: counts[RegionExecutionStatus.RECOGNIZED],
    failedRegions: counts[RegionExecutionStatus.FAILED],
    skippedRegions: counts[RegionExecutionStatus.SKIPPED],
    cancelledRegions: counts[RegionExecutionStatus.CANCELLED]
  }
  Object.entries(expectedCounts).forEach(([field, expected]) => {
    if (Number.isInteger(runResult[field]) && runResult[field] !== expected) {
      errors.push(error('counter_mismatch', `$.runResult.${field}`, 'Counter must match regionResults', {
        expected,
        received: runResult[field]
      }))
    }
  })

  return byIdentity
}

function validateRunDescriptor(descriptor, errors) {
  validateRequiredObject(descriptor, '$.runDescriptor', errors)
  if (!isObject(descriptor)) return

  for (const field of ['artifactId', 'contentHash', 'createdAt', 'runId', 'policy', 'environment', 'execution']) {
    if (!Object.hasOwn(descriptor, field)) {
      errors.push(error('missing_required_field', `$.runDescriptor.${field}`, 'Required field is missing'))
    }
  }
  if (Object.hasOwn(descriptor, 'corpusRef')) {
    errors.push(error('forbidden_field', '$.runDescriptor.corpusRef', 'Writer derives corpusRef from corpus'))
  }

  validateIdentifier(descriptor.artifactId, '$.runDescriptor.artifactId', errors)
  validateHash(descriptor.contentHash, '$.runDescriptor.contentHash', errors)
  if (!isValidTimestamp(descriptor.createdAt)) {
    errors.push(error('invalid_timestamp', '$.runDescriptor.createdAt', 'Value must be a valid UTC RFC 3339 timestamp'))
  }
  validateIdentifier(descriptor.runId, '$.runDescriptor.runId', errors)
  validateVersionedDescriptor(descriptor.policy, '$.runDescriptor.policy', errors)
  validateRequiredObject(descriptor.environment, '$.runDescriptor.environment', errors)
  validateRequiredObject(descriptor.execution, '$.runDescriptor.execution', errors)
}

function validateSampleDescriptor(descriptor, index, expectedResult, errors) {
  const path = `$.sampleDescriptors[${index}]`
  validateRequiredObject(descriptor, path, errors)
  if (!isObject(descriptor)) return

  for (const field of [
    'artifactId',
    'contentHash',
    'createdAt',
    'executionResult',
    'runMode',
    'sampleIndex',
    'renderPlan',
    'timingMs',
    'raster',
    'memory'
  ]) {
    if (!Object.hasOwn(descriptor, field)) {
      errors.push(error('missing_required_field', `${path}.${field}`, 'Required field is missing'))
    }
  }
  for (const field of ['runRef', 'corpusRef']) {
    if (Object.hasOwn(descriptor, field)) {
      errors.push(error('forbidden_field', `${path}.${field}`, `Writer derives ${field}`))
    }
  }

  validateIdentifier(descriptor.artifactId, `${path}.artifactId`, errors)
  validateHash(descriptor.contentHash, `${path}.contentHash`, errors)
  if (!isValidTimestamp(descriptor.createdAt)) {
    errors.push(error('invalid_timestamp', `${path}.createdAt`, 'Value must be a valid UTC RFC 3339 timestamp'))
  }
  if (!RUN_MODES.includes(descriptor.runMode)) {
    errors.push(error('invalid_run_mode', `${path}.runMode`, 'Run mode is not supported', { allowed: [...RUN_MODES] }))
  }
  if (!Number.isInteger(descriptor.sampleIndex) || descriptor.sampleIndex < 0) {
    errors.push(error('invalid_sample_index', `${path}.sampleIndex`, 'Sample index must be a non-negative integer'))
  }
  for (const field of ['renderPlan', 'timingMs', 'raster', 'memory']) {
    validateRequiredObject(descriptor[field], `${path}.${field}`, errors)
  }

  const result = validateRegionExecutionResult(descriptor.executionResult)
  result.errors.forEach((item) => errors.push({ ...item, path: `${path}.executionResult${item.path.slice(1)}` }))

  if (!expectedResult || !descriptor.executionResult) return
  const received = descriptor.executionResult
  if (
    received.documentId !== expectedResult.documentId ||
    received.regionId !== expectedResult.regionId ||
    received.status !== expectedResult.status
  ) {
    errors.push(error('execution_result_mismatch', `${path}.executionResult`, 'Execution result must match runResult identity', {
      expected: {
        documentId: expectedResult.documentId,
        regionId: expectedResult.regionId,
        status: expectedResult.status
      },
      received: {
        documentId: received.documentId,
        regionId: received.regionId,
        status: received.status
      }
    }))
  }
}

function validateArtifactStatusPayload(descriptor, index, errors) {
  const path = `$.sampleDescriptors[${index}]`
  const status = descriptor?.executionResult?.status
  if (status === RegionExecutionStatus.RECOGNIZED && !descriptor.recognition) {
    errors.push(error('missing_recognition', `${path}.recognition`, 'Recognized samples require descriptor-owned recognition output'))
  }
  if (status === RegionExecutionStatus.FAILED && !descriptor.error) {
    errors.push(error('missing_failure', `${path}.error`, 'Failed samples require descriptor-owned failure information'))
  }
  if (status !== RegionExecutionStatus.RECOGNIZED && descriptor?.recognition) {
    errors.push(error('incompatible_status_data', `${path}.recognition`, 'Only recognized samples may include recognition output'))
  }
  if (status !== RegionExecutionStatus.FAILED && descriptor?.error) {
    errors.push(error('incompatible_status_data', `${path}.error`, 'Only failed samples may include failure information'))
  }
}

function validateDescriptorIdentity(descriptor, index, runResultByIdentity, errors) {
  const path = `$.sampleDescriptors[${index}].executionResult`
  if (!descriptor?.executionResult) return
  const expected = runResultByIdentity.get(executionIdentity(descriptor.executionResult))?.result
  if (!expected) {
    errors.push(error('execution_result_not_found', path, 'Execution result must exist in runResult by identity', {
      received: {
        documentId: descriptor.executionResult.documentId,
        regionId: descriptor.executionResult.regionId,
        status: descriptor.executionResult.status
      }
    }))
    return
  }
  if (descriptor.executionResult.status !== expected.status) {
    errors.push(error('execution_result_mismatch', path, 'Execution result status must match runResult identity', {
      expected: {
        documentId: expected.documentId,
        regionId: expected.regionId,
        status: expected.status
      },
      received: {
        documentId: descriptor.executionResult.documentId,
        regionId: descriptor.executionResult.regionId,
        status: descriptor.executionResult.status
      }
    }))
  }
}

function validateDescriptorOrdering(sampleDescriptors, regionResults, errors) {
  sampleDescriptors.forEach((descriptor, index) => {
    const expected = regionResults[index]
    const received = descriptor?.executionResult
    if (!expected || !received) return
    if (executionIdentity(received) !== executionIdentity(expected)) {
      errors.push(error('execution_result_order_mismatch', `$.sampleDescriptors[${index}].executionResult`, 'Sample descriptors must preserve runResult order', {
        expected: {
          documentId: expected.documentId,
          regionId: expected.regionId
        },
        received: {
          documentId: received.documentId,
          regionId: received.regionId
        }
      }))
    }
  })
}

function validateDescriptorExecutionIdentities(sampleDescriptors, errors) {
  const seen = new Map()
  sampleDescriptors.forEach((descriptor, index) => {
    if (!descriptor?.executionResult) return
    const key = executionIdentity(descriptor.executionResult)
    if (seen.has(key)) {
      errors.push(error('duplicate_execution_identity', `$.sampleDescriptors[${index}].executionResult`, 'Execution identity must be unique', {
        firstPath: seen.get(key)
      }))
      return
    }
    seen.set(key, `$.sampleDescriptors[${index}].executionResult`)
  })
}

function validateDuplicates(runDescriptor, sampleDescriptors, errors) {
  const artifactIds = new Map()
  const sampleIndexes = new Map()
  const entries = [
    ['$.runDescriptor.artifactId', runDescriptor?.artifactId],
    ...sampleDescriptors.map((descriptor, index) => [`$.sampleDescriptors[${index}].artifactId`, descriptor?.artifactId])
  ]

  entries.forEach(([path, artifactId]) => {
    if (!artifactId) return
    if (artifactIds.has(artifactId)) {
      errors.push(error('duplicate_artifact_id', path, 'Artifact ID must be unique', {
        firstPath: artifactIds.get(artifactId)
      }))
      return
    }
    artifactIds.set(artifactId, path)
  })

  sampleDescriptors.forEach((descriptor, index) => {
    if (!Number.isInteger(descriptor?.sampleIndex)) return
    if (sampleIndexes.has(descriptor.sampleIndex)) {
      errors.push(error('duplicate_sample_index', `$.sampleDescriptors[${index}].sampleIndex`, 'Sample index must be unique', {
        firstPath: sampleIndexes.get(descriptor.sampleIndex)
      }))
      return
    }
    sampleIndexes.set(descriptor.sampleIndex, `$.sampleDescriptors[${index}].sampleIndex`)
  })
}

export class RawArtifactWriterInputValidationError extends Error {
  constructor(errors) {
    super('Raw artifact writer input validation failed')
    this.name = 'RawArtifactWriterInputValidationError'
    this.errors = errors
  }
}

export function createRawRunDescriptor(input = {}) {
  return { ...input }
}

export function createRawSampleDescriptor(input = {}) {
  return { ...input }
}

export function validateRawArtifactWriterInput(input) {
  const errors = []
  const sampleDescriptors = Array.isArray(input?.sampleDescriptors) ? input.sampleDescriptors : []
  const regionResults = Array.isArray(input?.runResult?.regionResults) ? input.runResult.regionResults : []

  if (!input?.corpus) errors.push(error('missing_required_field', '$.corpus', 'Required field is missing'))
  if (!input?.runResult) errors.push(error('missing_required_field', '$.runResult', 'Required field is missing'))
  const runResultByIdentity = validateRunResult(input?.runResult, errors)
  validateRunDescriptor(input?.runDescriptor, errors)
  if (!Array.isArray(input?.sampleDescriptors)) {
    errors.push(error('invalid_array', '$.sampleDescriptors', 'Value must be an array'))
  }
  if (sampleDescriptors.length !== regionResults.length) {
    errors.push(error('sample_count_mismatch', '$.sampleDescriptors', 'Sample descriptor count must match run results', {
      expected: regionResults.length,
      received: sampleDescriptors.length
    }))
  }

  sampleDescriptors.forEach((descriptor, index) => {
    validateSampleDescriptor(descriptor, index, null, errors)
    validateArtifactStatusPayload(descriptor, index, errors)
    validateDescriptorIdentity(descriptor, index, runResultByIdentity, errors)
  })
  validateDescriptorOrdering(sampleDescriptors, regionResults, errors)
  validateDescriptorExecutionIdentities(sampleDescriptors, errors)
  validateDuplicates(input?.runDescriptor, sampleDescriptors, errors)

  return { valid: errors.length === 0, errors: sortErrors(errors), value: input }
}

export function finalizeRawArtifactWriterInput(input) {
  const result = validateRawArtifactWriterInput(input)
  if (!result.valid) throw new RawArtifactWriterInputValidationError(result.errors)
  return deepFreeze(input)
}
