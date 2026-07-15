export function collectCorpusAssets(manifest) {
  return (manifest.documents || []).flatMap((document, documentIndex) => {
    const documentAsset = {
      kind: 'document',
      path: document.file,
      contentHash: document.contentHash,
      schemaPath: `$.documents[${documentIndex}].file`,
      hashPath: `$.documents[${documentIndex}].contentHash`
    }

    const groundTruthAssets = (document.regions || []).map((region, regionIndex) => ({
      kind: 'ground-truth',
      path: region.groundTruth?.path,
      contentHash: region.groundTruth?.contentHash,
      schemaPath: `$.documents[${documentIndex}].regions[${regionIndex}].groundTruth.path`,
      hashPath: `$.documents[${documentIndex}].regions[${regionIndex}].groundTruth.contentHash`
    }))

    return [documentAsset, ...groundTruthAssets]
  })
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

export function createBenchmarkCorpusModel(manifest, metadata = {}) {
  return deepFreeze({
    manifest,
    corpusId: manifest.corpusId,
    corpusVersion: manifest.corpusVersion,
    schemaVersion: manifest.schemaVersion,
    documents: manifest.documents,
    assets: collectCorpusAssets(manifest),
    metadata: { ...metadata }
  })
}
