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

function sortedValues(values) {
  return [...values].sort()
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function numbersMatch(expected, received) {
  return Math.abs(expected - received) <= Number.EPSILON * Math.max(1, Math.abs(expected), Math.abs(received))
}

function validateLabelSet(actual, expected, path, code, message, errors) {
  const received = sortedValues(actual)
  if (!sameValues(received, expected)) {
    errors.push(error(code, path, message, { expected, received }))
  }
}

function validateComparisonSemantics(artifact, errors) {
  if (!Array.isArray(artifact.candidates)) return
  const labels = artifact.candidates.map((candidate) => candidate?.label).filter((label) => typeof label === 'string')
  const expectedLabels = sortedValues(labels)
  const metrics = artifact.metrics && typeof artifact.metrics === 'object' && !Array.isArray(artifact.metrics) ? artifact.metrics : {}
  const matrix = artifact.comparisonMatrix && typeof artifact.comparisonMatrix === 'object' && !Array.isArray(artifact.comparisonMatrix) ? artifact.comparisonMatrix : {}
  const metricIds = sortedValues(Object.keys(metrics))
  const candidatesByLabel = new Map(artifact.candidates.map((candidate) => [candidate?.label, candidate]))

  artifact.candidates.forEach((candidate, index) => {
    validateReferenceType(candidate?.scoredResultRef, [ARTIFACT_TYPES.SCORED_RESULT], `$.candidates[${index}].scoredResultRef`, errors)
    validateLabelSet(
      Object.keys(candidate?.summary?.metrics || {}),
      metricIds,
      `$.candidates[${index}].summary.metrics`,
      'candidate_summary_metric_set_mismatch',
      'Candidate summary metrics must match comparison artifact metrics',
      errors
    )
  })

  Object.entries(metrics).forEach(([metricId, comparison]) => {
    validateLabelSet(
      (comparison?.candidateValues || []).map((value) => value?.label).filter((label) => typeof label === 'string'),
      expectedLabels,
      `$.metrics.${metricId}.candidateValues`,
      'invalid_metric_structure',
      'Metric candidate values must match comparison candidates',
      errors
    )
    validateLabelSet(
      Object.keys(comparison?.pairwiseDifferences || {}),
      expectedLabels,
      `$.metrics.${metricId}.pairwiseDifferences`,
      'invalid_metric_structure',
      'Metric pairwise rows must match comparison candidates',
      errors
    )
    Object.entries(comparison?.pairwiseDifferences || {}).forEach(([label, row]) => {
      validateLabelSet(
        Object.keys(row || {}),
        expectedLabels,
        `$.metrics.${metricId}.pairwiseDifferences.${label}`,
        'invalid_metric_structure',
        'Metric pairwise columns must match comparison candidates',
        errors
      )
    })
    ;(comparison?.candidateValues || []).forEach((candidateValue, index) => {
      const summaryMetric = candidatesByLabel.get(candidateValue?.label)?.summary?.metrics?.[metricId]
      const path = `$.metrics.${metricId}.candidateValues[${index}]`
      if (!summaryMetric || typeof summaryMetric !== 'object') return
      if (candidateValue.count !== summaryMetric.count) {
        errors.push(error('metric_count_mismatch', `${path}.count`, 'Metric candidate value count must match candidate summary', {
          expected: summaryMetric.count,
          received: candidateValue.count
        }))
      }
      if (!numbersMatch(summaryMetric.mean, candidateValue.value)) {
        errors.push(error('metric_mean_mismatch', `${path}.value`, 'Metric candidate value must match candidate summary mean', {
          expected: summaryMetric.mean,
          received: candidateValue.value
        }))
      }
    })

    const valuesByLabel = new Map((comparison?.candidateValues || []).map((candidateValue) => [candidateValue?.label, candidateValue?.value]))
    Object.entries(comparison?.pairwiseDifferences || {}).forEach(([leftLabel, row]) => {
      Object.entries(row || {}).forEach(([rightLabel, difference]) => {
        if (leftLabel === rightLabel && !numbersMatch(0, difference)) {
          errors.push(error('invalid_pairwise_diagonal', `$.metrics.${metricId}.pairwiseDifferences.${leftLabel}.${rightLabel}`, 'Pairwise diagonal difference must be zero', {
            expected: 0,
            received: difference
          }))
        }
        const reverse = comparison?.pairwiseDifferences?.[rightLabel]?.[leftLabel]
        if (typeof reverse === 'number' && !numbersMatch(difference, -reverse)) {
          errors.push(error('invalid_pairwise_difference', `$.metrics.${metricId}.pairwiseDifferences.${leftLabel}.${rightLabel}`, 'Pairwise differences must be antisymmetric', {
            expected: -reverse,
            received: difference
          }))
        }
        const leftValue = valuesByLabel.get(leftLabel)
        const rightValue = valuesByLabel.get(rightLabel)
        if (typeof leftValue === 'number' && typeof rightValue === 'number' && !numbersMatch(leftValue - rightValue, difference)) {
          errors.push(error('invalid_pairwise_difference', `$.metrics.${metricId}.pairwiseDifferences.${leftLabel}.${rightLabel}`, 'Pairwise difference must equal left candidate value minus right candidate value', {
            expected: leftValue - rightValue,
            received: difference
          }))
        }
      })
    })
  })

  if (Array.isArray(artifact.samples)) artifact.samples.forEach((sample, index) => {
    validateLabelSet(
      (sample?.candidateResults || []).map((result) => result?.label).filter((label) => typeof label === 'string'),
      expectedLabels,
      `$.samples[${index}].candidateResults`,
      'invalid_sample_structure',
      'Sample candidate results must match comparison candidates',
      errors
    )
    ;(sample?.candidateResults || []).forEach((result, resultIndex) => {
      const resultPath = `$.samples[${index}].candidateResults[${resultIndex}]`
      if (result?.status !== sample?.status) {
        errors.push(error('incompatible_sample_status', `${resultPath}.status`, 'Sample candidate result status must match comparison sample status', {
          expected: sample?.status,
          received: result?.status
        }))
      }
      if (result?.status === 'recognized') {
        validateLabelSet(
          Object.keys(result.metrics || {}),
          metricIds,
          `${resultPath}.metrics`,
          'sample_metric_set_mismatch',
          'Recognized sample metrics must match comparison artifact metrics',
          errors
        )
        validateSchemaValue(result.metrics, SCORE_METRICS_SCHEMA, `${resultPath}.metrics`, errors)
      } else if (['failed', 'cancelled', 'skipped'].includes(result?.status) && Object.keys(result?.metrics || {}).length > 0) {
        errors.push(error('incompatible_status_metrics', `${resultPath}.metrics`, 'Only recognized samples may include metrics'))
      }
    })
  })

  validateLabelSet(
    Object.keys(matrix),
    expectedLabels,
    '$.comparisonMatrix',
    'invalid_matrix_structure',
    'Comparison matrix rows must match comparison candidates',
    errors
  )
  Object.entries(matrix).forEach(([label, row]) => {
    validateLabelSet(
      Object.keys(row || {}),
      expectedLabels,
      `$.comparisonMatrix.${label}`,
      'invalid_matrix_structure',
      'Comparison matrix columns must match comparison candidates',
      errors
    )
    Object.entries(row || {}).forEach(([rightLabel, cell]) => {
      validateLabelSet(
        Object.keys(cell?.metrics || {}),
        metricIds,
        `$.comparisonMatrix.${label}.${rightLabel}.metrics`,
        'invalid_matrix_structure',
        'Comparison matrix cell metrics must match artifact metrics',
        errors
      )
      Object.entries(cell?.metrics || {}).forEach(([metricId, value]) => {
        const expected = metrics?.[metricId]?.pairwiseDifferences?.[label]?.[rightLabel]
        if (typeof expected === 'number' && !numbersMatch(expected, value)) {
          errors.push(error('incompatible_matrix_metric', `$.comparisonMatrix.${label}.${rightLabel}.metrics.${metricId}`, 'Comparison matrix metric must match metric pairwise difference', {
            expected,
            received: value
          }))
        }
      })
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
      validateComparisonSemantics(artifact, errors)
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
      return (artifact.candidates || []).map((candidate) => candidate.scoredResultRef)
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
