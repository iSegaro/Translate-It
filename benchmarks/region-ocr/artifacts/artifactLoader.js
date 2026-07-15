import {
  ARTIFACT_TYPES,
  BenchmarkArtifactValidationError,
  finalizeBenchmarkArtifact,
  validateBenchmarkArtifact
} from '../schemas/index.js'

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

function artifactRefMatches(reference, artifact) {
  return reference?.artifactType === artifact?.artifactType &&
    reference?.artifactId === artifact?.artifactId &&
    reference?.schemaVersion === artifact?.schemaVersion &&
    reference?.contentHash === artifact?.contentHash
}

function artifactRefsEqual(left, right) {
  return left?.artifactType === right?.artifactType &&
    left?.artifactId === right?.artifactId &&
    left?.schemaVersion === right?.schemaVersion &&
    left?.contentHash === right?.contentHash
}

function stableStringify(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function policyMatches(left, right) {
  return left?.id === right?.id &&
    left?.version === right?.version &&
    stableStringify(left?.parameters || {}) === stableStringify(right?.parameters || {})
}

function sampleIdentity(sample) {
  return JSON.stringify([
    sample?.caseRef?.documentId,
    sample?.caseRef?.regionId,
    sample?.sampleIndex
  ])
}

function artifactReferenceKey(reference) {
  return JSON.stringify([
    reference?.artifactType,
    reference?.artifactId,
    reference?.schemaVersion,
    reference?.contentHash
  ])
}

function validateScoredResultRelationships(artifacts, errors) {
  const rawSamples = []
  const rawSamplesByRef = new Map()
  const rawRun = artifacts.find((artifact) => artifact?.artifactType === ARTIFACT_TYPES.RAW_RUN)
  artifacts.forEach((artifact) => {
    if (artifact?.artifactType === ARTIFACT_TYPES.RAW_SAMPLE) {
      rawSamples.push(artifact)
      rawSamplesByRef.set(artifactReferenceKey(artifact), artifact)
    }
  })

  artifacts.forEach((artifact, artifactIndex) => {
    if (artifact?.artifactType !== ARTIFACT_TYPES.SCORED_RESULT) return
    if (rawRun && !artifactRefMatches(artifact.rawRunRef, rawRun)) {
      errors.push(error('unresolved_raw_run_reference', `$[${artifactIndex}].rawRunRef`, 'SCORED_RESULT rawRunRef must resolve to the bundle RAW_RUN'))
    }
    if (rawRun && !artifactRefsEqual(artifact.corpusRef, rawRun.corpusRef)) {
      errors.push(error('incompatible_corpus_reference', `$[${artifactIndex}].corpusRef`, 'SCORED_RESULT corpusRef must match RAW_RUN corpusRef'))
    }

    const sampleRefs = new Map()
    const resolvedSampleRefs = new Set()
    ;(artifact.samples || []).forEach((sample, sampleIndex) => {
      const refKey = artifactReferenceKey(sample?.sampleRef)
      if (sampleRefs.has(refKey)) {
        errors.push(error('duplicate_sample_reference', `$[${artifactIndex}].samples[${sampleIndex}].sampleRef`, 'SCORED_RESULT sampleRef must be unique within the artifact', {
          firstPath: sampleRefs.get(refKey)
        }))
      } else {
        sampleRefs.set(refKey, `$[${artifactIndex}].samples[${sampleIndex}].sampleRef`)
      }

      const rawSample = rawSamplesByRef.get(refKey)
      if (!rawSample) {
        errors.push(error('unresolved_sample_reference', `$[${artifactIndex}].samples[${sampleIndex}].sampleRef`, 'SCORED_RESULT sampleRef must resolve to a RAW_SAMPLE in the bundle'))
        return
      }
      resolvedSampleRefs.add(refKey)
      if (sample.status !== rawSample.status) {
        errors.push(error('incompatible_sample_status', `$[${artifactIndex}].samples[${sampleIndex}].status`, 'SCORED_RESULT sample status must match referenced RAW_SAMPLE status', {
          expected: rawSample.status,
          received: sample.status
        }))
      }
    })

    rawSamples.forEach((rawSample) => {
      if (resolvedSampleRefs.has(artifactReferenceKey(rawSample))) return
      errors.push(error('missing_scored_sample_reference', `$[${artifactIndex}].samples`, 'SCORED_RESULT samples must include every RAW_SAMPLE in the bundle', {
        artifactId: rawSample.artifactId,
        sampleId: rawSample.sampleId,
        documentId: rawSample.caseRef?.documentId,
        regionId: rawSample.caseRef?.regionId
      }))
    })
  })
}

function validateRawBundleRelationships(artifacts, errors) {
  const rawRuns = artifacts
    .map((artifact, index) => ({ artifact, index }))
    .filter(({ artifact }) => artifact?.artifactType === ARTIFACT_TYPES.RAW_RUN)
  const rawSamples = artifacts
    .map((artifact, index) => ({ artifact, index }))
    .filter(({ artifact }) => artifact?.artifactType === ARTIFACT_TYPES.RAW_SAMPLE)

  if (rawRuns.length === 0) {
    errors.push(error('missing_raw_run', '$', 'Bundle must contain exactly one RAW_RUN artifact'))
  }
  if (rawRuns.length > 1) {
    rawRuns.slice(1).forEach(({ index }) => {
      errors.push(error('multiple_raw_runs', `$[${index}]`, 'Bundle must contain exactly one RAW_RUN artifact'))
    })
  }
  const rawRun = rawRuns[0]?.artifact
  const sampleIds = new Map()
  const sampleIdentities = new Map()
  rawSamples.forEach(({ artifact, index }) => {
    if (rawRun && !artifactRefMatches(artifact.runRef, rawRun)) {
      errors.push(error('incompatible_run_reference', `$[${index}].runRef`, 'RAW_SAMPLE runRef must match bundle RAW_RUN'))
    }
    if (rawRun && !artifactRefsEqual(artifact.corpusRef, rawRun.corpusRef)) {
      errors.push(error('incompatible_corpus_reference', `$[${index}].corpusRef`, 'RAW_SAMPLE corpusRef must match RAW_RUN corpusRef'))
    }
    if (rawRun && !policyMatches(artifact.policy, rawRun.policy)) {
      errors.push(error('incompatible_policy', `$[${index}].policy`, 'RAW_SAMPLE policy must match RAW_RUN policy'))
    }

    if (artifact.sampleId) {
      if (sampleIds.has(artifact.sampleId)) {
        errors.push(error('duplicate_sample_id', `$[${index}].sampleId`, 'RAW_SAMPLE sampleId must be unique', {
          firstPath: sampleIds.get(artifact.sampleId)
        }))
      } else {
        sampleIds.set(artifact.sampleId, `$[${index}].sampleId`)
      }
    }

    const identity = sampleIdentity(artifact)
    if (sampleIdentities.has(identity)) {
      errors.push(error('duplicate_sample_identity', `$[${index}].caseRef`, 'Document/region/sampleIndex identity must be unique', {
        firstPath: sampleIdentities.get(identity)
      }))
    } else {
      sampleIdentities.set(identity, `$[${index}].caseRef`)
    }
  })
}

function validateBundleRelationships(artifacts) {
  const errors = []
  const types = new Set(artifacts.map((artifact) => artifact?.artifactType))
  const rawScoredTypes = [ARTIFACT_TYPES.RAW_RUN, ARTIFACT_TYPES.RAW_SAMPLE, ARTIFACT_TYPES.SCORED_RESULT]
  const rawScoredOnly = [...types].every((type) => rawScoredTypes.includes(type))

  if (types.has(ARTIFACT_TYPES.RAW_RUN) || types.has(ARTIFACT_TYPES.RAW_SAMPLE)) {
    if (!rawScoredOnly) {
      errors.push(error('incompatible_artifact_combination', '$', 'RAW/SCORED bundles may contain only RAW_RUN, RAW_SAMPLE, and SCORED_RESULT artifacts', {
        artifactTypes: [...types].sort()
      }))
    } else {
      validateRawBundleRelationships(artifacts, errors)
      validateScoredResultRelationships(artifacts, errors)
    }
  }

  return errors
}

function validateBundleArtifacts(artifacts) {
  const errors = []
  const artifactIds = new Map()
  artifacts.forEach((artifact, index) => {
    const result = validateBenchmarkArtifact(artifact)
    result.errors.forEach((item) => errors.push({ ...item, path: `$[${index}]${item.path.slice(1)}` }))
    if (!artifact?.artifactId) return
    if (artifactIds.has(artifact.artifactId)) {
      errors.push(error('duplicate_artifact_id', `$[${index}].artifactId`, 'Artifact ID must be unique', {
        firstPath: artifactIds.get(artifact.artifactId)
      }))
    } else {
      artifactIds.set(artifact.artifactId, `$[${index}].artifactId`)
    }
  })
  return errors
}

export class BenchmarkArtifactLoaderValidationError extends Error {
  constructor(errors) {
    super('Benchmark artifact loading failed')
    this.name = 'BenchmarkArtifactLoaderValidationError'
    this.errors = errors
  }
}

export function validateLoadedArtifact(artifact) {
  return validateBenchmarkArtifact(artifact)
}

export function finalizeLoadedArtifact(artifact) {
  const result = validateLoadedArtifact(artifact)
  if (!result.valid) throw new BenchmarkArtifactLoaderValidationError(result.errors)
  return finalizeBenchmarkArtifact(artifact)
}

export function loadBenchmarkArtifact(artifact) {
  return finalizeLoadedArtifact(artifact)
}

export function loadBenchmarkArtifactBundle(artifacts) {
  if (!Array.isArray(artifacts)) {
    throw new TypeError('loadBenchmarkArtifactBundle requires an array')
  }

  const errors = []
  validateBundleArtifacts(artifacts).forEach((item) => errors.push(item))
  validateBundleRelationships(artifacts).forEach((item) => errors.push(item))

  if (errors.length > 0) throw new BenchmarkArtifactLoaderValidationError(sortErrors(errors))

  const finalized = artifacts.map((artifact) => finalizeBenchmarkArtifact(artifact))
  return deepFreeze({ artifacts: finalized })
}

export function createBenchmarkArtifactLoader() {
  return Object.freeze({
    loadArtifact: loadBenchmarkArtifact,
    loadBundle: loadBenchmarkArtifactBundle,
    validateArtifact: validateLoadedArtifact,
    finalizeArtifact: finalizeLoadedArtifact
  })
}

export { BenchmarkArtifactValidationError }
