const SAMPLE_STATUSES = Object.freeze(['recognized', 'failed', 'cancelled', 'skipped'])

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

function cloneValue(value, seen = new Map()) {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)
  const clone = Array.isArray(value) ? [] : {}
  seen.set(value, clone)
  Object.entries(value).forEach(([key, child]) => { clone[key] = cloneValue(child, seen) })
  return clone
}

function canonicalSerialize(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`
}

function descriptorMatches(left, right) {
  return canonicalSerialize(left) === canonicalSerialize(right)
}

function sampleIdentity(sample) {
  return `${sample?.documentId || ''}\u0000${sample?.regionId || ''}`
}

function metricIds(value) {
  return Object.keys(value || {}).sort()
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function validateMetricValue(value, path, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(error('invalid_metric_value', path, 'Comparable metric value must be a finite number'))
  }
}

function meansMatch(expected, received) {
  return Math.abs(expected - received) <= Number.EPSILON * Math.max(1, Math.abs(expected), Math.abs(received))
}

function validateRuntimeResult(candidate, candidateIndex, errors) {
  const path = `$.candidates[${candidateIndex}].runtimeScoringResult`
  const runtime = candidate?.runtimeScoringResult
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime) ||
    !Array.isArray(runtime.sampleScores) || !runtime.summary || typeof runtime.summary !== 'object' ||
    !runtime.summary.metrics || typeof runtime.summary.metrics !== 'object' || Array.isArray(runtime.summary.metrics)) {
    errors.push(error('invalid_runtime_result', path, 'Candidate requires a valid RuntimeScoringResult'))
    return null
  }

  const samplesByIdentity = new Map()
  const sampleMetricIds = new Set()
  const metricAggregates = new Map()
  runtime.sampleScores.forEach((sample, sampleIndex) => {
    const samplePath = `${path}.sampleScores[${sampleIndex}]`
    if (!sample || typeof sample !== 'object' || typeof sample.documentId !== 'string' ||
      typeof sample.regionId !== 'string' || !SAMPLE_STATUSES.includes(sample.status) ||
      !sample.metrics || typeof sample.metrics !== 'object' || Array.isArray(sample.metrics)) {
      errors.push(error('invalid_runtime_result', samplePath, 'Runtime sample score is malformed'))
      return
    }

    const identity = sampleIdentity(sample)
    if (samplesByIdentity.has(identity)) {
      errors.push(error('duplicate_sample_identity', samplePath, 'Runtime sample identity must be unique', {
        firstPath: samplesByIdentity.get(identity).path,
        documentId: sample.documentId,
        regionId: sample.regionId
      }))
    } else {
      samplesByIdentity.set(identity, { sample, path: samplePath })
    }

    if (sample.status !== 'recognized') {
      if (Object.keys(sample.metrics).length > 0) {
        errors.push(error('incompatible_status_metrics', `${samplePath}.metrics`, 'Non-recognized samples must have empty metrics'))
      }
      return
    }
    metricIds(sample.metrics).forEach((metricId) => {
      sampleMetricIds.add(metricId)
      const value = sample.metrics[metricId]
      validateMetricValue(value, `${samplePath}.metrics.${metricId}`, errors)
      const aggregate = metricAggregates.get(metricId) || { count: 0, sum: 0, valid: true }
      aggregate.count += 1
      if (typeof value === 'number' && Number.isFinite(value)) aggregate.sum += value
      else aggregate.valid = false
      metricAggregates.set(metricId, aggregate)
    })
  })

  const summaryMetricIds = metricIds(runtime.summary.metrics)
  summaryMetricIds.forEach((metricId) => {
    const aggregate = runtime.summary.metrics[metricId]
    if (!aggregate || typeof aggregate !== 'object' || !Number.isInteger(aggregate.count) || aggregate.count < 0) {
      errors.push(error('invalid_metric_value', `${path}.summary.metrics.${metricId}.count`, 'Metric sample count must be a non-negative integer'))
    }
    validateMetricValue(aggregate?.mean, `${path}.summary.metrics.${metricId}.mean`, errors)

    const expected = metricAggregates.get(metricId) || { count: 0, sum: 0, valid: true }
    if (Number.isInteger(aggregate?.count) && aggregate.count >= 0 && aggregate.count !== expected.count) {
      errors.push(error('metric_count_mismatch', `${path}.summary.metrics.${metricId}.count`, 'Runtime summary metric count must match recognized samples', {
        expected: expected.count,
        received: aggregate.count
      }))
    }
    if (expected.count === 0 && aggregate?.mean !== 0) {
      errors.push(error('metric_mean_mismatch', `${path}.summary.metrics.${metricId}.mean`, 'Zero-count runtime summary metrics must have a zero mean', {
        expected: 0,
        received: aggregate?.mean
      }))
    } else if (expected.count > 0 && expected.valid && typeof aggregate?.mean === 'number' && Number.isFinite(aggregate.mean)) {
      const expectedMean = expected.sum / expected.count
      if (!meansMatch(expectedMean, aggregate.mean)) {
        errors.push(error('metric_mean_mismatch', `${path}.summary.metrics.${metricId}.mean`, 'Runtime summary metric mean must match recognized samples', {
          expected: expectedMean,
          received: aggregate.mean
        }))
      }
    }
  })

  const recognizedMetricIds = [...sampleMetricIds].sort()
  if (!sameValues(recognizedMetricIds, summaryMetricIds)) {
    errors.push(error('metric_set_mismatch', `${path}.summary.metrics`, 'Runtime summary metric set must match recognized sample metrics', {
      expected: recognizedMetricIds,
      received: summaryMetricIds
    }))
  }
  runtime.sampleScores.forEach((sample, sampleIndex) => {
    if (sample?.status !== 'recognized' || !sample.metrics || typeof sample.metrics !== 'object') return
    const ids = metricIds(sample.metrics)
    if (!sameValues(ids, summaryMetricIds)) {
      errors.push(error('metric_set_mismatch', `${path}.sampleScores[${sampleIndex}].metrics`, 'Recognized sample metric set must match runtime summary', {
        expected: summaryMetricIds,
        received: ids
      }))
    }
  })

  return { runtime, samplesByIdentity, metricIds: summaryMetricIds }
}

function validateCandidates(candidates) {
  const errors = []
  if (!Array.isArray(candidates) || candidates.length < 2) {
    errors.push(error('invalid_candidates', '$.candidates', 'Comparison requires at least two candidates'))
    return { errors, validated: [] }
  }

  const labels = new Map()
  const validated = candidates.map((candidate, index) => {
    const path = `$.candidates[${index}]`
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
      typeof candidate.label !== 'string' || candidate.label.length === 0 ||
      !candidate.normalizationPolicy || typeof candidate.normalizationPolicy !== 'object' ||
      !candidate.scorer || typeof candidate.scorer !== 'object' ||
      !candidate.metadata || typeof candidate.metadata !== 'object' || Array.isArray(candidate.metadata)) {
      errors.push(error('invalid_candidates', path, 'Comparison candidate is malformed'))
    }
    if (typeof candidate?.label === 'string') {
      if (labels.has(candidate.label)) {
        errors.push(error('duplicate_candidate_label', `${path}.label`, 'Candidate labels must be unique', {
          firstPath: labels.get(candidate.label),
          label: candidate.label
        }))
      } else {
        labels.set(candidate.label, `${path}.label`)
      }
    }

    const result = validateRuntimeResult(candidate, index, errors)
    if (result && !descriptorMatches(candidate.normalizationPolicy, result.runtime.normalizationPolicy)) {
      errors.push(error('normalization_policy_mismatch', `${path}.normalizationPolicy`, 'Candidate normalization policy must match its runtime result'))
    }
    if (result && !descriptorMatches(candidate.scorer, result.runtime.scorer)) {
      errors.push(error('scorer_mismatch', `${path}.scorer`, 'Candidate scorer must match its runtime result'))
    }
    return result
  })

  const baselineCandidate = candidates[0]
  const baseline = validated[0]
  if (!baseline) return { errors: sortErrors(errors), validated }

  candidates.slice(1).forEach((candidate, offset) => {
    const index = offset + 1
    const current = validated[index]
    if (!current) return
    if (!descriptorMatches(candidate.normalizationPolicy, baselineCandidate.normalizationPolicy)) {
      errors.push(error('normalization_policy_mismatch', `$.candidates[${index}].normalizationPolicy`, 'Candidate normalization policies must match', {
        expectedLabel: baselineCandidate.label,
        receivedLabel: candidate.label
      }))
    }
    if (!descriptorMatches(candidate.scorer, baselineCandidate.scorer)) {
      errors.push(error('scorer_mismatch', `$.candidates[${index}].scorer`, 'Candidate scorers must match', {
        expectedLabel: baselineCandidate.label,
        receivedLabel: candidate.label
      }))
    }
    if (!sameValues(current.metricIds, baseline.metricIds)) {
      errors.push(error('metric_set_mismatch', `$.candidates[${index}].runtimeScoringResult.summary.metrics`, 'Candidate metric sets must match', {
        expected: baseline.metricIds,
        received: current.metricIds
      }))
    }

    const baselineIds = [...baseline.samplesByIdentity.keys()].sort()
    const currentIds = [...current.samplesByIdentity.keys()].sort()
    if (!sameValues(currentIds, baselineIds)) {
      errors.push(error('sample_identity_mismatch', `$.candidates[${index}].runtimeScoringResult.sampleScores`, 'Candidate sample identity sets must match', {
        expected: baselineIds,
        received: currentIds
      }))
    }

    const baselineOrder = baseline.runtime.sampleScores.map(sampleIdentity)
    const currentOrder = current.runtime.sampleScores.map(sampleIdentity)
    if (!sameValues(currentOrder, baselineOrder)) {
      errors.push(error('sample_order_mismatch', `$.candidates[${index}].runtimeScoringResult.sampleScores`, 'Candidate sample ordering must match', {
        expected: baselineOrder,
        received: currentOrder
      }))
    }

    baseline.samplesByIdentity.forEach(({ sample }, identity) => {
      const currentSample = current.samplesByIdentity.get(identity)?.sample
      if (currentSample && currentSample.status !== sample.status) {
        errors.push(error('sample_status_mismatch', `$.candidates[${index}].runtimeScoringResult.sampleScores`, 'Candidate sample statuses must match', {
          documentId: sample.documentId,
          regionId: sample.regionId,
          expected: sample.status,
          received: currentSample.status
        }))
      }
    })
  })

  return { errors: sortErrors(errors), validated }
}

function buildMetrics(candidates, metricIds) {
  return Object.fromEntries(metricIds.map((metricId) => {
    const candidateValues = candidates.map((candidate) => ({
      label: candidate.label,
      count: candidate.runtimeScoringResult.summary.metrics[metricId].count,
      value: candidate.runtimeScoringResult.summary.metrics[metricId].mean
    }))
    const pairwiseDifferences = Object.fromEntries(candidateValues.map((left) => [
      left.label,
      Object.fromEntries(candidateValues.map((right) => [right.label, left.label === right.label ? 0 : left.value - right.value]))
    ]))
    return [metricId, { candidateValues, pairwiseDifferences }]
  }))
}

function buildSampleComparisons(candidates) {
  return candidates[0].runtimeScoringResult.sampleScores.map((sample, sampleIndex) => ({
    documentId: sample.documentId,
    regionId: sample.regionId,
    // Baseline status is valid here because candidate status equality is validated before output construction.
    status: sample.status,
    candidateResults: candidates.map((candidate) => {
      const result = candidate.runtimeScoringResult.sampleScores[sampleIndex]
      return { label: candidate.label, status: result.status, metrics: cloneValue(result.metrics) }
    })
  }))
}

function buildComparisonMatrix(candidates, metrics) {
  return Object.fromEntries(candidates.map((left) => [
    left.label,
    Object.fromEntries(candidates.map((right) => [
      right.label,
      {
        metrics: Object.fromEntries(Object.entries(metrics).map(([metricId, comparison]) => [
          metricId,
          comparison.pairwiseDifferences[left.label][right.label]
        ]))
      }
    ]))
  ]))
}

export class ComparisonRuntimeValidationError extends Error {
  constructor(errors) {
    super('Comparison runtime validation failed')
    this.name = 'ComparisonRuntimeValidationError'
    this.errors = errors
  }
}

export function compareBenchmarkResults({ candidates } = {}) {
  const { errors, validated } = validateCandidates(candidates)
  if (errors.length > 0) throw new ComparisonRuntimeValidationError(errors)

  const metricIds = validated[0].metricIds
  const metrics = buildMetrics(candidates, metricIds)
  const sampleComparisons = buildSampleComparisons(candidates)
  const comparisonMatrix = buildComparisonMatrix(candidates, metrics)

  return deepFreeze({
    candidates: candidates.map((candidate) => ({
      label: candidate.label,
      normalizationPolicy: cloneValue(candidate.normalizationPolicy),
      scorer: cloneValue(candidate.scorer),
      summary: cloneValue(candidate.runtimeScoringResult.summary),
      metadata: cloneValue(candidate.metadata)
    })),
    metrics,
    sampleComparisons,
    comparisonMatrix,
    diagnostics: {
      candidateCount: candidates.length,
      metricCount: metricIds.length,
      sampleCount: sampleComparisons.length,
      pairwiseDifference: 'leftValue - rightValue'
    }
  })
}

export function createComparisonEngine() {
  return Object.freeze({
    compare(candidates) {
      return compareBenchmarkResults({ candidates })
    }
  })
}
