import { ARTIFACT_TYPES } from '../schemas/index.js'

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

function artifactRef(artifact) {
  return {
    artifactType: artifact.artifactType,
    artifactId: artifact.artifactId,
    schemaVersion: artifact.schemaVersion,
    contentHash: artifact.contentHash
  }
}

function extractRecognizedText(sample, errors) {
  if (sample.status !== 'recognized') return null
  const rawOutput = sample.recognition?.rawOutput
  if (typeof rawOutput === 'string') return rawOutput
  if (rawOutput && typeof rawOutput.text === 'string') return rawOutput.text
  errors.push(error('invalid_recognized_payload', '$.recognition.rawOutput', 'Recognized sample requires text output'))
  return null
}

export class ScoringCaseValidationError extends Error {
  constructor(errors) {
    super('Scoring case validation failed')
    this.name = 'ScoringCaseValidationError'
    this.errors = errors
  }
}

export function createScoringCase({ rawSample, groundTruthLookup }) {
  const errors = []
  if (rawSample?.artifactType !== ARTIFACT_TYPES.RAW_SAMPLE) {
    errors.push(error('invalid_raw_sample', '$.artifactType', 'Scoring case requires a RAW_SAMPLE artifact'))
  }
  if (!['recognized', 'failed', 'cancelled', 'skipped'].includes(rawSample?.status)) {
    errors.push(error('unsupported_status', '$.status', 'RAW_SAMPLE status is not supported'))
  }

  const documentId = rawSample?.caseRef?.documentId
  const regionId = rawSample?.caseRef?.regionId
  const groundTruth = groundTruthLookup?.get(documentId, regionId)
  if (!groundTruth) {
    errors.push(error('missing_ground_truth', '$.caseRef', 'Ground truth is missing', { documentId, regionId }))
  }

  const recognizedText = extractRecognizedText(rawSample, errors)
  if (errors.length > 0) throw new ScoringCaseValidationError(sortErrors(errors))

  return deepFreeze({
    rawSampleRef: artifactRef(rawSample),
    documentId,
    regionId,
    status: rawSample.status,
    recognizedText,
    groundTruthText: groundTruth.text,
    language: groundTruth.language,
    direction: groundTruth.direction,
    metadata: {
      groundTruth: groundTruth.metadata || {},
      sample: {
        sampleId: rawSample.sampleId,
        sampleIndex: rawSample.sampleIndex,
        runMode: rawSample.runMode
      }
    }
  })
}

export function createScoringCases({ rawSamples, groundTruthLookup }) {
  const errors = []
  const cases = []
  ;(rawSamples || []).forEach((rawSample, index) => {
    try {
      cases.push(createScoringCase({ rawSample, groundTruthLookup }))
    } catch (caught) {
      caught.errors?.forEach((item) => errors.push({ ...item, path: `$[${index}]${item.path.slice(1)}` }))
    }
  })
  if (errors.length > 0) throw new ScoringCaseValidationError(sortErrors(errors))
  return deepFreeze(cases)
}

export function createScoringCaseAdapter({ groundTruthLookup }) {
  return Object.freeze({
    createCase(rawSample) {
      return createScoringCase({ rawSample, groundTruthLookup })
    },
    createCases(rawSamples) {
      return createScoringCases({ rawSamples, groundTruthLookup })
    }
  })
}
