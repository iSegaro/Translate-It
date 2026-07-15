import {
  ARTIFACT_TYPES,
  SCHEMA_VERSIONS,
  finalizeBenchmarkArtifact
} from '../schemas/index.js'
import { finalizeRawArtifactWriterInput } from './writerInputContract.js'

function artifactRef(artifact) {
  return {
    artifactType: artifact.artifactType,
    artifactId: artifact.artifactId,
    schemaVersion: artifact.schemaVersion,
    contentHash: artifact.contentHash
  }
}

function corpusManifest(corpus) {
  return corpus.manifest || corpus
}

export function createRawRunArtifact({ corpus, runDescriptor }) {
  const manifest = corpusManifest(corpus)
  return finalizeBenchmarkArtifact({
    ...runDescriptor,
    schemaVersion: SCHEMA_VERSIONS[ARTIFACT_TYPES.RAW_RUN],
    artifactType: ARTIFACT_TYPES.RAW_RUN,
    corpusRef: artifactRef(manifest)
  })
}

export function createRawSampleArtifact({ corpus, rawRun, sampleDescriptor }) {
  const manifest = corpusManifest(corpus)
  const { executionResult, ...artifactFields } = sampleDescriptor
  return finalizeBenchmarkArtifact({
    ...artifactFields,
    schemaVersion: SCHEMA_VERSIONS[ARTIFACT_TYPES.RAW_SAMPLE],
    artifactType: ARTIFACT_TYPES.RAW_SAMPLE,
    sampleId: sampleDescriptor.artifactId,
    runRef: artifactRef(rawRun),
    corpusRef: artifactRef(manifest),
    caseRef: {
      documentId: executionResult.documentId,
      regionId: executionResult.regionId
    },
    policy: rawRun.policy,
    status: executionResult.status
  })
}

export function writeRawArtifacts(input) {
  const finalizedInput = finalizeRawArtifactWriterInput(input)
  const run = createRawRunArtifact({
    corpus: finalizedInput.corpus,
    runDescriptor: finalizedInput.runDescriptor
  })
  const samples = finalizedInput.sampleDescriptors.map((sampleDescriptor) => createRawSampleArtifact({
    corpus: finalizedInput.corpus,
    rawRun: run,
    sampleDescriptor
  }))

  return Object.freeze({ run, samples: Object.freeze(samples) })
}
