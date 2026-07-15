const SUPPORTED_STATUSES = Object.freeze(['recognized', 'failed', 'cancelled', 'skipped'])

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

function validateMetricRegistry(metrics) {
  const errors = []
  const seen = new Map()
  metrics.forEach((metric, index) => {
    if (!metric?.id) {
      errors.push(error('missing_metric_id', `$.metrics[${index}].id`, 'Metric requires an id'))
      return
    }
    if (seen.has(metric.id)) {
      errors.push(error('duplicate_metric_id', `$.metrics[${index}].id`, 'Metric id must be unique', {
        firstPath: seen.get(metric.id)
      }))
      return
    }
    seen.set(metric.id, `$.metrics[${index}].id`)
    if (typeof metric.calculate !== 'function') {
      errors.push(error('invalid_metric', `$.metrics[${index}].calculate`, 'Metric requires calculate function'))
    }
  })
  return errors
}

function validateNormalizationOutput(value, path) {
  const errors = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(error('invalid_normalization_output', path, 'Normalization output must be an object'))
    return errors
  }
  if (typeof value.predicted !== 'string') {
    errors.push(error('invalid_normalization_output', `${path}.predicted`, 'Normalized predicted text must be a string'))
  }
  if (typeof value.expected !== 'string') {
    errors.push(error('invalid_normalization_output', `${path}.expected`, 'Normalized expected text must be a string'))
  }
  return errors
}

function validateMetricOutput(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return [error('invalid_metric_output', path, 'Metric output must be a finite number')]
  }
  return []
}

function stableCause(cause) {
  if (cause && typeof cause === 'object') {
    return {
      name: typeof cause.name === 'string' ? cause.name : 'Error',
      message: typeof cause.message === 'string' ? cause.message : String(cause)
    }
  }
  return { name: 'Error', message: String(cause) }
}

function emptySummary() {
  return {
    total: 0,
    recognized: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    metrics: {}
  }
}

function aggregateSummary(sampleScores) {
  const summary = emptySummary()
  const metricTotals = {}

  sampleScores.forEach((sampleScore) => {
    summary.total += 1
    summary[sampleScore.status] += 1
    if (sampleScore.status !== 'recognized') return

    Object.entries(sampleScore.metrics).forEach(([metricId, value]) => {
      const metric = metricTotals[metricId] || { count: 0, sum: 0 }
      metric.count += 1
      metric.sum += value
      metricTotals[metricId] = metric
    })
  })

  Object.entries(metricTotals).forEach(([metricId, metric]) => {
    summary.metrics[metricId] = {
      count: metric.count,
      mean: metric.sum / metric.count
    }
  })

  return summary
}

function passthroughScore(scoringCase) {
  return {
    documentId: scoringCase.documentId,
    regionId: scoringCase.regionId,
    status: scoringCase.status,
    metrics: {},
    normalization: null,
    diagnostics: {},
    metadata: scoringCase.metadata || {}
  }
}

export class ScoringRuntimeValidationError extends Error {
  constructor(errors) {
    super('Runtime scoring validation failed')
    this.name = 'ScoringRuntimeValidationError'
    this.errors = errors
  }
}

export function scoreBenchmark({
  scoringCases,
  normalize,
  metrics = [],
  normalizationPolicy,
  scorer
}) {
  const errors = []
  if (!Array.isArray(scoringCases)) errors.push(error('invalid_scoring_cases', '$.scoringCases', 'Scoring cases must be an array'))
  if (typeof normalize !== 'function') errors.push(error('invalid_normalizer', '$.normalize', 'Normalizer must be a function'))
  errors.push(...validateMetricRegistry(metrics))
  if (errors.length > 0) throw new ScoringRuntimeValidationError(sortErrors(errors))

  const orderedMetrics = [...metrics].sort((left, right) => left.id.localeCompare(right.id))
  const sampleScores = []

  scoringCases.forEach((scoringCase, index) => {
    const path = `$.scoringCases[${index}]`
    if (!SUPPORTED_STATUSES.includes(scoringCase?.status)) {
      errors.push(error('unsupported_status', `${path}.status`, 'Scoring case status is not supported'))
      return
    }

    if (scoringCase.status !== 'recognized') {
      sampleScores.push(passthroughScore(scoringCase))
      return
    }

    const sampleErrorCount = errors.length
    let normalization
    try {
      normalization = normalize(scoringCase)
    } catch (cause) {
      errors.push(error('normalization_failed', `${path}.normalization`, 'Normalization failed', {
        cause: stableCause(cause)
      }))
      return
    }
    const normalizationErrors = validateNormalizationOutput(normalization, `${path}.normalization`)
    if (normalizationErrors.length > 0) {
      errors.push(...normalizationErrors)
      return
    }

    const metricValues = {}
    orderedMetrics.forEach((metric) => {
      let value
      try {
        value = metric.calculate({
          predicted: normalization.predicted,
          expected: normalization.expected
        })
      } catch (cause) {
        errors.push(error('metric_failed', `${path}.metrics.${metric.id}`, 'Metric calculation failed', {
          cause: stableCause(cause)
        }))
        return
      }
      const metricErrors = validateMetricOutput(value, `${path}.metrics.${metric.id}`)
      if (metricErrors.length > 0) {
        errors.push(...metricErrors)
        return
      }
      metricValues[metric.id] = value
    })

    if (errors.length > sampleErrorCount) return

    const score = {
      documentId: scoringCase.documentId,
      regionId: scoringCase.regionId,
      status: scoringCase.status,
      metrics: metricValues,
      normalization: {
        predicted: normalization.predicted,
        expected: normalization.expected
      },
      diagnostics: normalization.diagnostics || {},
      metadata: scoringCase.metadata || {}
    }
    sampleScores.push(score)
  })

  if (errors.length > 0) throw new ScoringRuntimeValidationError(sortErrors(errors))

  return deepFreeze({
    sampleScores,
    summary: aggregateSummary(sampleScores),
    normalizationPolicy,
    scorer
  })
}

export function createScoringEngine(options) {
  return Object.freeze({
    score(scoringCases) {
      return scoreBenchmark({ ...options, scoringCases })
    }
  })
}
