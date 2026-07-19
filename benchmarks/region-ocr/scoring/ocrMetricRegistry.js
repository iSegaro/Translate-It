import { createScoringCaseAdapter } from './scoringCaseAdapter.js'
import { scoreBenchmark } from './scoringRuntime.js'
import { writeScoredArtifact } from './scoredArtifactWriter.js'

function editDistance(predicted, expected) {
  let previous = Array.from({ length: expected.length + 1 }, (_, index) => index)
  for (let predictedIndex = 1; predictedIndex <= predicted.length; predictedIndex += 1) {
    const current = [predictedIndex]
    for (let expectedIndex = 1; expectedIndex <= expected.length; expectedIndex += 1) {
      current[expectedIndex] = Math.min(
        current[expectedIndex - 1] + 1,
        previous[expectedIndex] + 1,
        previous[expectedIndex - 1] + (predicted[predictedIndex - 1] === expected[expectedIndex - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[expected.length]
}

function deletionRate(predicted, expected) {
  let previous = Array.from({ length: expected.length + 1 }, (_, index) => ({ distance: index, deletions: index }))
  for (let predictedIndex = 1; predictedIndex <= predicted.length; predictedIndex += 1) {
    const current = [{ distance: predictedIndex, deletions: 0 }]
    for (let expectedIndex = 1; expectedIndex <= expected.length; expectedIndex += 1) {
      const candidates = [
        { distance: current[expectedIndex - 1].distance + 1, deletions: current[expectedIndex - 1].deletions },
        { distance: previous[expectedIndex].distance + 1, deletions: previous[expectedIndex].deletions + 1 },
        {
          distance: previous[expectedIndex - 1].distance + (predicted[predictedIndex - 1] === expected[expectedIndex - 1] ? 0 : 1),
          deletions: previous[expectedIndex - 1].deletions
        }
      ]
      current[expectedIndex] = candidates.sort((left, right) => left.distance - right.distance || left.deletions - right.deletions)[0]
    }
    previous = current
  }
  return previous[expected.length].deletions / Math.max(expected.length, 1)
}

function words(value) {
  return value.trim() ? value.trim().split(/\s+/) : []
}

function normalizeUnicodeNfc(scoringCase) {
  return {
    predicted: scoringCase.recognizedText.normalize('NFC'),
    expected: scoringCase.groundTruthText.normalize('NFC'),
    diagnostics: { normalization: 'unicode-nfc' }
  }
}

function createNormalizer(normalizationPolicy) {
  if (normalizationPolicy?.id !== 'unicode-nfc') {
    throw new TypeError(`Unsupported OCR normalization policy: ${normalizationPolicy?.id || 'missing'}`)
  }
  return normalizeUnicodeNfc
}

function artifactCompatibleRuntimeResult(runtimeResult) {
  return Object.freeze({
    ...runtimeResult,
    sampleScores: Object.freeze(runtimeResult.sampleScores.map(sampleScore => Object.freeze({
      ...sampleScore,
      metrics: sampleScore.status === 'recognized'
        ? Object.freeze({ ...sampleScore.metrics, rtlOrderCorrect: null })
        : sampleScore.metrics
    })))
  })
}

export const OCR_METRICS = Object.freeze([
  Object.freeze({
    id: 'cer',
    calculate({ predicted, expected }) {
      return editDistance(predicted, expected) / Math.max(expected.length, 1)
    }
  }),
  Object.freeze({
    id: 'wer',
    calculate({ predicted, expected }) {
      const predictedWords = words(predicted)
      const expectedWords = words(expected)
      return editDistance(predictedWords, expectedWords) / Math.max(expectedWords.length, 1)
    }
  }),
  Object.freeze({
    id: 'exactMatch',
    calculate({ predicted, expected }) {
      return predicted === expected ? 1 : 0
    }
  }),
  Object.freeze({
    id: 'deletionRate',
    calculate({ predicted, expected }) {
      return deletionRate(predicted, expected)
    }
  })
])

export function createOcrMetricRegistry({ corpus, groundTruthLookup, scorer } = {}) {
  const normalizationPolicy = (corpus?.manifest || corpus)?.normalizationPolicy
  if (!groundTruthLookup) throw new TypeError('createOcrMetricRegistry requires groundTruthLookup')
  const normalize = createNormalizer(normalizationPolicy)
  const scoringCaseAdapter = createScoringCaseAdapter({ groundTruthLookup })
  const scorerDescriptor = scorer || {
    id: 'region-ocr-metrics',
    version: '1.0.0',
    parameters: { metrics: OCR_METRICS.map(metric => metric.id) }
  }

  return Object.freeze({
    metrics: OCR_METRICS,
    createScoringCases(rawSamples) {
      return scoringCaseAdapter.createCases(rawSamples)
    },
    score({ rawSamples, rawRun, scoredResultDescriptor }) {
      const runtimeResult = artifactCompatibleRuntimeResult(scoreBenchmark({
        scoringCases: scoringCaseAdapter.createCases(rawSamples),
        normalize,
        metrics: OCR_METRICS,
        normalizationPolicy,
        scorer: scorerDescriptor
      }))
      const artifact = writeScoredArtifact({
        rawSamples,
        rawRun,
        runtimeScoringResult: runtimeResult,
        scoredResultDescriptor
      })
      return Object.freeze({ runtimeResult, artifact })
    }
  })
}
