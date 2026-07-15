import {
  ARTIFACT_TYPES,
  COMPARISON_COMPATIBILITY,
  DOCUMENT_TYPES,
  IDENTIFIER_PATTERN,
  REPORT_FORMATS,
  ROTATIONS,
  RUN_MODES,
  SAMPLE_STATUSES,
  SHA256_PATTERN,
  TIMESTAMP_PATTERN,
  VERSION_PATTERN
} from './artifactModels.js'

const string = (options = {}) => ({ type: 'string', ...options })
const number = (options = {}) => ({ type: 'number', ...options })
const integer = (options = {}) => ({ type: 'integer', ...options })
const object = (required, properties, options = {}) => ({
  type: 'object',
  required,
  properties,
  additionalProperties: true,
  ...options
})
const array = (items, options = {}) => ({ type: 'array', items, ...options })

const identifier = string({ pattern: IDENTIFIER_PATTERN })
const version = string({ pattern: VERSION_PATTERN })
const hash = string({ pattern: SHA256_PATTERN })
const timestamp = string({ pattern: TIMESTAMP_PATTERN, format: 'timestamp' })
const relativePath = string({ minLength: 1, format: 'relative-path' })
const extensionBag = { type: 'object', additionalProperties: true }
const nullableNumber = { type: ['number', 'null'] }
const nullableBoolean = { type: ['boolean', 'null'] }

const versionedDescriptor = object(
  ['id', 'version'],
  {
    id: identifier,
    version,
    parameters: { type: 'object', additionalProperties: true }
  }
)

export const ARTIFACT_REFERENCE_SCHEMA = object(
  ['artifactType', 'artifactId', 'schemaVersion', 'contentHash'],
  {
    artifactType: string({ enum: Object.values(ARTIFACT_TYPES) }),
    artifactId: identifier,
    schemaVersion: version,
    contentHash: hash
  }
)

const commonProperties = {
  schemaVersion: version,
  artifactType: string({ enum: Object.values(ARTIFACT_TYPES) }),
  artifactId: identifier,
  contentHash: hash,
  createdAt: timestamp,
  extensions: extensionBag
}

function artifactSchema(artifactType, required, properties) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://translate-it.local/schemas/region-ocr/${artifactType}/1.0.0`,
    type: 'object',
    required: ['schemaVersion', 'artifactType', 'artifactId', 'contentHash', 'createdAt', ...required],
    properties: {
      ...commonProperties,
      artifactType: { const: artifactType },
      ...properties
    },
    additionalProperties: true
  }
}

const pdfRegion = object(
  ['left', 'top', 'right', 'bottom'],
  {
    left: number(),
    top: number(),
    right: number(),
    bottom: number()
  },
  { format: 'pdf-region' }
)

const groundTruthReference = object(
  ['path', 'contentHash'],
  {
    path: relativePath,
    contentHash: hash
  }
)

const corpusRegion = object(
  ['id', 'pageNumber', 'language', 'rotation', 'pdfRegion', 'groundTruth'],
  {
    id: identifier,
    pageNumber: integer({ minimum: 1 }),
    language: string({ minLength: 1 }),
    rotation: number({ enum: ROTATIONS }),
    regionCategory: identifier,
    pdfRegion,
    groundTruth: groundTruthReference,
    tags: array(identifier, { uniqueItems: true })
  }
)

const corpusDocument = object(
  ['id', 'file', 'contentHash', 'documentType', 'regions'],
  {
    id: identifier,
    file: relativePath,
    contentHash: hash,
    documentType: string({ enum: DOCUMENT_TYPES }),
    regions: array(corpusRegion, { minItems: 1, uniqueBy: 'id' }),
    tags: array(identifier, { uniqueItems: true })
  }
)

export const CORPUS_MANIFEST_SCHEMA = artifactSchema(
  ARTIFACT_TYPES.CORPUS_MANIFEST,
  ['corpusId', 'corpusVersion', 'normalizationPolicy', 'documents'],
  {
    corpusId: identifier,
    corpusVersion: version,
    normalizationPolicy: versionedDescriptor,
    documents: array(corpusDocument, { minItems: 1, uniqueBy: 'id' })
  }
)

const browserEnvironment = object(
  ['name', 'version'],
  {
    name: string({ enum: ['chromium', 'firefox', 'webkit'] }),
    version: string({ minLength: 1 })
  }
)

const runEnvironment = object(
  ['browser', 'os', 'pdfjsVersion', 'tesseractVersion', 'modelHashes'],
  {
    browser: browserEnvironment,
    os: string({ minLength: 1 }),
    cpu: string({ minLength: 1 }),
    memoryBytes: integer({ minimum: 0 }),
    commit: string({ pattern: '^[a-f0-9]{7,64}$' }),
    pdfjsVersion: version,
    tesseractVersion: version,
    modelHashes: {
      type: 'object',
      minProperties: 1,
      additionalProperties: hash
    }
  }
)

const runExecution = object(
  ['seed', 'runModes', 'repetitions', 'parallelism'],
  {
    seed: string({ minLength: 1 }),
    runModes: array(string({ enum: RUN_MODES }), { minItems: 1, uniqueItems: true }),
    repetitions: integer({ minimum: 1 }),
    parallelism: integer({ minimum: 1 })
  }
)

export const RAW_RUN_SCHEMA = artifactSchema(
  ARTIFACT_TYPES.RAW_RUN,
  ['runId', 'corpusRef', 'policy', 'environment', 'execution'],
  {
    runId: identifier,
    corpusRef: ARTIFACT_REFERENCE_SCHEMA,
    policy: versionedDescriptor,
    environment: runEnvironment,
    execution: runExecution
  }
)

const caseReference = object(
  ['documentId', 'regionId'],
  {
    documentId: identifier,
    regionId: identifier
  }
)

const sampleTiming = object(
  ['pageResolution', 'render', 'ocr', 'total'],
  {
    pageResolution: number({ minimum: 0 }),
    render: number({ minimum: 0 }),
    ocr: number({ minimum: 0 }),
    total: number({ minimum: 0 })
  }
)

const sampleRaster = object(
  ['width', 'height', 'pixelCount', 'rgbaBytes'],
  {
    width: integer({ minimum: 0 }),
    height: integer({ minimum: 0 }),
    pixelCount: integer({ minimum: 0 }),
    rgbaBytes: integer({ minimum: 0 })
  }
)

const sampleMemory = object(
  ['peakDeltaBytes', 'measurementMethod'],
  {
    peakDeltaBytes: { type: ['integer', 'null'], minimum: 0 },
    measurementMethod: { type: ['string', 'null'], minLength: 1 }
  }
)

const recognitionData = object(
  ['rawOutput'],
  {
    rawOutput: { type: 'object', additionalProperties: true }
  }
)

const errorData = object(
  ['name', 'message'],
  {
    name: string({ minLength: 1 }),
    message: string({ minLength: 1 }),
    code: string({ minLength: 1 })
  }
)

export const RAW_SAMPLE_SCHEMA = artifactSchema(
  ARTIFACT_TYPES.RAW_SAMPLE,
  [
    'sampleId',
    'runRef',
    'corpusRef',
    'caseRef',
    'policy',
    'runMode',
    'sampleIndex',
    'renderPlan',
    'status',
    'timingMs',
    'raster',
    'memory'
  ],
  {
    sampleId: identifier,
    runRef: ARTIFACT_REFERENCE_SCHEMA,
    corpusRef: ARTIFACT_REFERENCE_SCHEMA,
    caseRef: caseReference,
    policy: versionedDescriptor,
    runMode: string({ enum: RUN_MODES }),
    sampleIndex: integer({ minimum: 0 }),
    renderPlan: { type: 'object', minProperties: 1, additionalProperties: true },
    status: string({ enum: SAMPLE_STATUSES }),
    recognition: recognitionData,
    error: errorData,
    timingMs: sampleTiming,
    raster: sampleRaster,
    memory: sampleMemory
  }
)

export const SCORE_METRICS_SCHEMA = object(
  ['cer', 'wer', 'deletionRate', 'rtlOrderCorrect'],
  {
    cer: number({ minimum: 0 }),
    wer: nullableNumber,
    deletionRate: number({ minimum: 0 }),
    rtlOrderCorrect: nullableBoolean
  }
)

const scoredSample = object(
  ['sampleRef', 'status', 'metrics'],
  {
    sampleRef: ARTIFACT_REFERENCE_SCHEMA,
    status: string({ enum: SAMPLE_STATUSES }),
    metrics: { type: 'object', additionalProperties: true }
  }
)

export const SCORED_RESULT_SCHEMA = artifactSchema(
  ARTIFACT_TYPES.SCORED_RESULT,
  ['scoredResultId', 'rawRunRef', 'corpusRef', 'normalizationPolicy', 'scorer', 'samples'],
  {
    scoredResultId: identifier,
    rawRunRef: ARTIFACT_REFERENCE_SCHEMA,
    corpusRef: ARTIFACT_REFERENCE_SCHEMA,
    normalizationPolicy: versionedDescriptor,
    scorer: versionedDescriptor,
    samples: array(scoredSample, { uniqueBy: 'sampleRef.artifactId' })
  }
)

const comparisonEntry = object(
  ['caseId', 'metricId', 'left', 'right', 'absoluteDelta', 'relativeDelta'],
  {
    caseId: identifier,
    metricId: identifier,
    left: nullableNumber,
    right: nullableNumber,
    absoluteDelta: nullableNumber,
    relativeDelta: nullableNumber
  }
)

export const COMPARISON_RESULT_SCHEMA = artifactSchema(
  ARTIFACT_TYPES.COMPARISON_RESULT,
  ['comparisonId', 'leftRef', 'rightRef', 'comparisonAxes', 'compatibility', 'entries'],
  {
    comparisonId: identifier,
    leftRef: ARTIFACT_REFERENCE_SCHEMA,
    rightRef: ARTIFACT_REFERENCE_SCHEMA,
    comparisonAxes: array(identifier, { minItems: 1, uniqueItems: true }),
    compatibility: string({ enum: COMPARISON_COMPATIBILITY }),
    entries: array(comparisonEntry, { uniqueBy: ['caseId', 'metricId'] })
  }
)

const reportFile = object(
  ['format', 'path', 'contentHash'],
  {
    format: string({ enum: REPORT_FORMATS }),
    path: relativePath,
    contentHash: hash
  }
)

export const REPORT_MANIFEST_SCHEMA = artifactSchema(
  ARTIFACT_TYPES.REPORT_MANIFEST,
  ['reportId', 'sourceRefs', 'generatedBy', 'files'],
  {
    reportId: identifier,
    sourceRefs: array(ARTIFACT_REFERENCE_SCHEMA, { minItems: 1, uniqueBy: 'artifactId' }),
    generatedBy: versionedDescriptor,
    files: array(reportFile, { minItems: 1, uniqueBy: ['format', 'path'] })
  }
)

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

export const ARTIFACT_SCHEMAS = deepFreeze({
  [ARTIFACT_TYPES.CORPUS_MANIFEST]: { '1.0.0': CORPUS_MANIFEST_SCHEMA },
  [ARTIFACT_TYPES.RAW_RUN]: { '1.0.0': RAW_RUN_SCHEMA },
  [ARTIFACT_TYPES.RAW_SAMPLE]: { '1.0.0': RAW_SAMPLE_SCHEMA },
  [ARTIFACT_TYPES.SCORED_RESULT]: { '1.0.0': SCORED_RESULT_SCHEMA },
  [ARTIFACT_TYPES.COMPARISON_RESULT]: { '1.0.0': COMPARISON_RESULT_SCHEMA },
  [ARTIFACT_TYPES.REPORT_MANIFEST]: { '1.0.0': REPORT_MANIFEST_SCHEMA }
})

export function getBenchmarkArtifactSchema(artifactType, schemaVersion) {
  return ARTIFACT_SCHEMAS[artifactType]?.[schemaVersion] || null
}
