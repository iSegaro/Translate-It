import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { BenchmarkCorpusValidationError, finalizeBenchmarkCorpus } from './validateCorpus.js'

function parseJsonManifest(content, manifestPath) {
  try {
    return JSON.parse(content)
  } catch (cause) {
    throw new BenchmarkCorpusValidationError([{
      code: 'invalid_manifest_json',
      path: '$',
      message: 'Corpus manifest must be valid JSON',
      details: { manifestPath, cause: cause.message }
    }])
  }
}

export async function loadBenchmarkCorpus(manifestPath, options = {}) {
  const resolvedManifestPath = path.resolve(manifestPath)
  const content = await readFile(resolvedManifestPath, 'utf8')
  const manifest = parseJsonManifest(content, resolvedManifestPath)

  return finalizeBenchmarkCorpus(manifest, {
    ...options,
    manifestPath: resolvedManifestPath,
    rootDir: options.rootDir || path.dirname(resolvedManifestPath)
  })
}
