import {
  ARTIFACT_TYPES,
  SCHEMA_VERSIONS,
  finalizeBenchmarkArtifact
} from '../schemas/index.js'
import { finalizeComparisonArtifactWriterInput } from './comparisonArtifactWriterInput.js'

export function createComparisonResultArtifact(input) {
  const finalizedInput = finalizeComparisonArtifactWriterInput(input)
  const candidateRefs = finalizedInput.comparisonResultDescriptor.candidateRefs

  return finalizeBenchmarkArtifact({
    ...finalizedInput.comparisonResultDescriptor,
    schemaVersion: SCHEMA_VERSIONS[ARTIFACT_TYPES.COMPARISON_RESULT],
    artifactType: ARTIFACT_TYPES.COMPARISON_RESULT,
    candidates: finalizedInput.comparisonRuntimeResult.candidates.map((runtimeCandidate, index) => ({
      ...runtimeCandidate,
      scoredResultRef: candidateRefs[index].scoredResultRef
    })),
    metrics: finalizedInput.comparisonRuntimeResult.metrics,
    samples: finalizedInput.comparisonRuntimeResult.sampleComparisons,
    comparisonMatrix: finalizedInput.comparisonRuntimeResult.comparisonMatrix,
    diagnostics: finalizedInput.comparisonRuntimeResult.diagnostics
  })
}

export function writeComparisonArtifact(input) {
  return createComparisonResultArtifact(input)
}
