import {
  ARTIFACT_TYPES,
  SCHEMA_VERSIONS,
  finalizeBenchmarkArtifact
} from '../schemas/index.js'
import { finalizeScoredArtifactWriterInput } from './scoredArtifactWriterInput.js'

function artifactRef(artifact) {
  return {
    artifactType: artifact.artifactType,
    artifactId: artifact.artifactId,
    schemaVersion: artifact.schemaVersion,
    contentHash: artifact.contentHash
  }
}

function sampleKey(value) {
  return `${value.documentId}\u0000${value.regionId}`
}

function rawSampleKey(value) {
  return `${value.caseRef.documentId}\u0000${value.caseRef.regionId}`
}

export function createScoredResultArtifact(input) {
  const finalizedInput = finalizeScoredArtifactWriterInput(input)
  const rawSamplesByCase = new Map(finalizedInput.rawSamples.map((rawSample) => [rawSampleKey(rawSample), rawSample]))

  return finalizeBenchmarkArtifact({
    ...finalizedInput.scoredResultDescriptor,
    schemaVersion: SCHEMA_VERSIONS[ARTIFACT_TYPES.SCORED_RESULT],
    artifactType: ARTIFACT_TYPES.SCORED_RESULT,
    rawRunRef: artifactRef(finalizedInput.rawRun),
    corpusRef: finalizedInput.rawRun.corpusRef,
    samples: finalizedInput.runtimeScoringResult.sampleScores.map((sampleScore) => ({
      sampleRef: artifactRef(rawSamplesByCase.get(sampleKey(sampleScore))),
      status: sampleScore.status,
      metrics: sampleScore.metrics
    }))
  })
}

export function writeScoredArtifact(input) {
  return createScoredResultArtifact(input)
}
