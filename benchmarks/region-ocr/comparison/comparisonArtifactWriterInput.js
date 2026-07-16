import { validateBenchmarkArtifact } from '../schemas/index.js'

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

function canonicalSerialize(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function matches(left, right) {
  return canonicalSerialize(left) === canonicalSerialize(right)
}

function artifactRef(artifact) {
  return {
    artifactType: artifact?.artifactType,
    artifactId: artifact?.artifactId,
    schemaVersion: artifact?.schemaVersion,
    contentHash: artifact?.contentHash
  }
}

function refKey(reference) {
  return canonicalSerialize(artifactRef(reference))
}

function validateDescriptor(descriptor, errors) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    errors.push(error('invalid_descriptor', '$.comparisonResultDescriptor', 'Descriptor must be an object'))
    return
  }

  for (const field of ['artifactId', 'contentHash', 'createdAt', 'comparisonResultId', 'comparisonPolicy', 'candidateRefs']) {
    if (!Object.hasOwn(descriptor, field)) {
      errors.push(error('missing_required_field', `$.comparisonResultDescriptor.${field}`, 'Required field is missing'))
    }
  }

  for (const field of ['schemaVersion', 'artifactType', 'candidates', 'metrics', 'samples', 'comparisonMatrix', 'diagnostics']) {
    if (Object.hasOwn(descriptor, field)) {
      errors.push(error('forbidden_field', `$.comparisonResultDescriptor.${field}`, `Writer derives ${field}`))
    }
  }

  if (typeof descriptor.artifactId !== 'string' || !/^[-a-zA-Z0-9_]+$/.test(descriptor.artifactId)) {
    errors.push(error('invalid_identifier', '$.comparisonResultDescriptor.artifactId', 'Artifact ID must be valid'))
  }
  if (typeof descriptor.contentHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(descriptor.contentHash)) {
    errors.push(error('invalid_hash', '$.comparisonResultDescriptor.contentHash', 'Content hash must be a sha256 hash'))
  }
  if (typeof descriptor.createdAt !== 'string' || Number.isNaN(Date.parse(descriptor.createdAt))) {
    errors.push(error('invalid_timestamp', '$.comparisonResultDescriptor.createdAt', 'Created timestamp must be valid'))
  }
  if (typeof descriptor.comparisonResultId !== 'string' || !/^[-a-zA-Z0-9_]+$/.test(descriptor.comparisonResultId)) {
    errors.push(error('invalid_identifier', '$.comparisonResultDescriptor.comparisonResultId', 'Comparison result id must be valid'))
  }
  if (!descriptor.comparisonPolicy || typeof descriptor.comparisonPolicy !== 'object' || Array.isArray(descriptor.comparisonPolicy)) {
    errors.push(error('invalid_comparison_policy', '$.comparisonResultDescriptor.comparisonPolicy', 'Comparison policy must be an object'))
  }
  if (!Array.isArray(descriptor.candidateRefs)) {
    errors.push(error('invalid_array', '$.comparisonResultDescriptor.candidateRefs', 'candidateRefs must be an array'))
  }
}

function validateRuntime(runtime, errors) {
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
    errors.push(error('invalid_runtime_result', '$.comparisonRuntimeResult', 'Comparison runtime result must be an object'))
    return null
  }

  if (!Array.isArray(runtime.candidates) || !runtime.metrics || typeof runtime.metrics !== 'object' || Array.isArray(runtime.metrics) ||
    !Array.isArray(runtime.sampleComparisons) || !runtime.comparisonMatrix || typeof runtime.comparisonMatrix !== 'object' || Array.isArray(runtime.comparisonMatrix) ||
    !runtime.diagnostics || typeof runtime.diagnostics !== 'object' || Array.isArray(runtime.diagnostics)) {
    errors.push(error('invalid_runtime_result', '$.comparisonRuntimeResult', 'Comparison runtime result is malformed'))
    return null
  }

  const labels = new Set()
  runtime.candidates.forEach((candidate, index) => {
    const path = `$.comparisonRuntimeResult.candidates[${index}]`
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || typeof candidate.label !== 'string' || candidate.label.length === 0 ||
      !candidate.normalizationPolicy || typeof candidate.normalizationPolicy !== 'object' || Array.isArray(candidate.normalizationPolicy) ||
      !candidate.scorer || typeof candidate.scorer !== 'object' || Array.isArray(candidate.scorer) ||
      !candidate.summary || typeof candidate.summary !== 'object' || Array.isArray(candidate.summary) ||
      !candidate.metadata || typeof candidate.metadata !== 'object' || Array.isArray(candidate.metadata)) {
      errors.push(error('invalid_runtime_result', path, 'Comparison runtime candidate is malformed'))
      return
    }
    if (labels.has(candidate.label)) {
      errors.push(error('duplicate_candidate_label', `${path}.label`, 'Candidate labels must be unique', {
        label: candidate.label
      }))
    }
    labels.add(candidate.label)
  })

  return { runtime, labels: [...labels] }
}

function validateScoredResults(scoredResults, errors) {
  if (!Array.isArray(scoredResults)) {
    errors.push(error('invalid_array', '$.scoredResults', 'scoredResults must be an array'))
    return []
  }

  const byRef = new Map()
  const byPath = new Map()
  scoredResults.forEach((artifact, index) => {
    const result = validateBenchmarkArtifact(artifact)
    result.errors.forEach((item) => {
      errors.push({ ...item, path: `$.scoredResults[${index}]${item.path.slice(1)}` })
    })
    if (!artifact || artifact.artifactType !== 'scored-result') {
      errors.push(error('invalid_artifact_type', `$.scoredResults[${index}].artifactType`, 'scoredResults must contain SCORED_RESULT artifacts'))
      return
    }
    const key = refKey(artifact)
    if (byRef.has(key)) {
      errors.push(error('duplicate_scored_result_identity', `$.scoredResults[${index}]`, 'SCORED_RESULT identity must be unique', {
        firstPath: byPath.get(key)
      }))
      return
    }
    byRef.set(key, artifact)
    byPath.set(key, `$.scoredResults[${index}]`)
  })

  return byRef
}

function validateComparisonArtifactWriterInput(input) {
  const errors = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errors.push(error('invalid_input', '$', 'Writer input must be an object'))
    return { valid: false, errors, value: input }
  }

  validateDescriptor(input.comparisonResultDescriptor, errors)
  const runtime = validateRuntime(input.comparisonRuntimeResult, errors)
  const scoredResultsByRef = validateScoredResults(input.scoredResults, errors)

  if (runtime && Array.isArray(input.comparisonResultDescriptor?.candidateRefs) &&
    runtime.labels.length !== input.comparisonResultDescriptor.candidateRefs.length) {
    errors.push(error('candidate_count_mismatch', '$.comparisonRuntimeResult.candidates', 'Runtime candidate count must match descriptor candidateRefs count', {
      expected: input.comparisonResultDescriptor.candidateRefs.length,
      received: runtime.labels.length
    }))
  }

  if (runtime && Array.isArray(input.scoredResults) && input.scoredResults.length !== runtime.labels.length) {
    errors.push(error('candidate_count_mismatch', '$.scoredResults', 'Runtime candidate count must match scoredResults count', {
      expected: runtime.labels.length,
      received: input.scoredResults.length
    }))
  }

  if (runtime && Array.isArray(input.comparisonResultDescriptor?.candidateRefs) && scoredResultsByRef instanceof Map) {
    const candidateRefs = input.comparisonResultDescriptor.candidateRefs
    const seenLabels = new Set()
    const seenRefs = new Map()

    candidateRefs.forEach((candidateRef, index) => {
      const path = `$.comparisonResultDescriptor.candidateRefs[${index}]`
      if (!candidateRef || typeof candidateRef !== 'object' || Array.isArray(candidateRef) || typeof candidateRef.label !== 'string' || !candidateRef.scoredResultRef || typeof candidateRef.scoredResultRef !== 'object') {
        errors.push(error('invalid_reference', path, 'Candidate reference must be an object'))
        return
      }
      if (seenLabels.has(candidateRef.label)) {
        errors.push(error('duplicate_candidate_label', `${path}.label`, 'Candidate labels must be unique', { label: candidateRef.label }))
      }
      seenLabels.add(candidateRef.label)
      const runtimeCandidate = runtime.runtime.candidates[index]
      if (!runtimeCandidate) return
      if (runtimeCandidate.label !== candidateRef.label) {
        errors.push(error('candidate_label_mismatch', `${path}.label`, 'Candidate labels must match runtime ordering', {
          expected: runtimeCandidate.label,
          received: candidateRef.label
        }))
      }
      const scoredKey = refKey(candidateRef.scoredResultRef)
      const resolvedScoredResult = scoredResultsByRef.get(scoredKey)
      if (!resolvedScoredResult) {
        errors.push(error('unresolved_scored_result_reference', `${path}.scoredResultRef`, 'Candidate scoredResultRef must resolve to one supplied SCORED_RESULT'))
        return
      }
      if (seenRefs.has(scoredKey)) {
        errors.push(error('duplicate_candidate_reference', `${path}.scoredResultRef`, 'Candidate refs must resolve to unique SCORED_RESULT artifacts', {
          firstPath: seenRefs.get(scoredKey)
        }))
        return
      }
      seenRefs.set(scoredKey, `${path}.scoredResultRef`)
      if (!matches(runtimeCandidate.normalizationPolicy, resolvedScoredResult.normalizationPolicy)) {
        errors.push(error('normalization_policy_mismatch', `$.comparisonRuntimeResult.candidates[${index}].normalizationPolicy`, 'Candidate normalization policy must match referenced SCORED_RESULT'))
      }
      if (!matches(runtimeCandidate.scorer, resolvedScoredResult.scorer)) {
        errors.push(error('scorer_mismatch', `$.comparisonRuntimeResult.candidates[${index}].scorer`, 'Candidate scorer must match referenced SCORED_RESULT'))
      }
    })

    if (!sameValues(runtime.labels, candidateRefs.map((candidateRef) => candidateRef?.label))) {
      errors.push(error('candidate_ordering_mismatch', '$.comparisonResultDescriptor.candidateRefs', 'Candidate ordering must match runtime ordering', {
        expected: runtime.labels,
        received: candidateRefs.map((candidateRef) => candidateRef?.label)
      }))
    }
  }

  return { valid: errors.length === 0, errors: sortErrors(errors), value: input }
}

export class ComparisonArtifactWriterInputValidationError extends Error {
  constructor(errors) {
    super('Comparison artifact writer input validation failed')
    this.name = 'ComparisonArtifactWriterInputValidationError'
    this.errors = errors
  }
}

export function createComparisonResultDescriptor(input = {}) {
  return { ...input }
}

export function finalizeComparisonArtifactWriterInput(input) {
  const result = validateComparisonArtifactWriterInput(input)
  if (!result.valid) throw new ComparisonArtifactWriterInputValidationError(result.errors)
  return deepFreeze(input)
}

export { validateComparisonArtifactWriterInput }
