import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import {
  ARTIFACT_TYPES,
  BenchmarkArtifactValidationError,
  validateBenchmarkArtifact
} from '../schemas/index.js'
import { collectCorpusAssets, createBenchmarkCorpusModel } from './corpusModel.js'
import { isValidContentHash, verifyFileContentHash } from './checksums.js'

function error(code, pathValue, message, details) {
  return details === undefined
    ? { code, path: pathValue, message }
    : { code, path: pathValue, message, details }
}

function sortErrors(errors) {
  return errors.sort((left, right) => (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  ))
}

function isSafeRelativePath(value) {
  if (!value || value.startsWith('/') || value.startsWith('\\')) return false
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.includes('\\')) return false
  return !value.split('/').some((segment) => segment === '..' || segment === '')
}

function isInsideRoot(rootPath, assetPath) {
  const relative = path.relative(rootPath, assetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function assertValidUtf8(content) {
  new TextDecoder('utf-8', { fatal: true }).decode(content)
}

function validateCorpusIdentity(manifest, errors) {
  if (manifest?.artifactType !== ARTIFACT_TYPES.CORPUS_MANIFEST) {
    errors.push(error('invalid_corpus_manifest', '$.artifactType', 'Artifact must be a corpus manifest'))
  }
}

function validateSupportedCorpusVersion(manifest, options, errors) {
  if (!Array.isArray(options.supportedCorpusVersions) || typeof manifest?.corpusVersion !== 'string') return
  if (!options.supportedCorpusVersions.includes(manifest.corpusVersion)) {
    errors.push(error('unsupported_corpus_version', '$.corpusVersion', 'Corpus version is not supported', {
      supported: [...options.supportedCorpusVersions]
    }))
  }
}

function validateDuplicateAssets(assets, errors) {
  const seen = new Map()
  assets.forEach((asset) => {
    if (!asset.path) return
    if (seen.has(asset.path)) {
      errors.push(error('duplicate_asset', asset.schemaPath, 'Asset path must be unique within corpus', {
        path: asset.path,
        firstPath: seen.get(asset.path)
      }))
      return
    }
    seen.set(asset.path, asset.schemaPath)
  })
}

async function validateAssetFiles(assets, options, errors) {
  const { rootDir, verifyChecksums = false } = options
  if (!rootDir) return

  let rootPath
  try {
    rootPath = await realpath(rootDir)
  } catch {
    errors.push(error('invalid_corpus_root', '$', 'Corpus root must exist', { rootDir }))
    return
  }

  for (const asset of assets) {
    if (!asset.path || !isSafeRelativePath(asset.path)) continue
    if (!isValidContentHash(asset.contentHash)) continue

    const candidatePath = path.resolve(rootPath, asset.path)
    let filePath
    try {
      filePath = await realpath(candidatePath)
    } catch {
      errors.push(error('missing_asset', asset.schemaPath, 'Referenced asset is missing', { path: asset.path }))
      continue
    }

    if (!isInsideRoot(rootPath, filePath)) {
      errors.push(error('invalid_asset_reference', asset.schemaPath, 'Asset path must stay within corpus root', {
        path: asset.path
      }))
      continue
    }

    let fileStat
    try {
      fileStat = await stat(filePath)
    } catch {
      errors.push(error('missing_asset', asset.schemaPath, 'Referenced asset is missing', { path: asset.path }))
      continue
    }

    if (!fileStat.isFile()) {
      errors.push(error('invalid_asset_type', asset.schemaPath, 'Referenced asset must be a regular file', {
        path: asset.path
      }))
      continue
    }

    if (asset.kind === 'ground-truth') {
      try {
        assertValidUtf8(await readFile(filePath))
      } catch {
        errors.push(error('invalid_ground_truth_encoding', asset.schemaPath, 'Ground-truth asset must be valid UTF-8', {
          path: asset.path
        }))
        continue
      }
    }

    if (!verifyChecksums) continue

    const result = await verifyFileContentHash(filePath, asset.contentHash)
    if (!result.valid) {
      errors.push(error('checksum_mismatch', asset.hashPath, 'Asset checksum does not match file content', {
        path: asset.path,
        expectedHash: result.expectedHash,
        actualHash: result.actualHash
      }))
    }
  }
}

export class BenchmarkCorpusValidationError extends Error {
  constructor(errors) {
    super('Benchmark corpus validation failed')
    this.name = 'BenchmarkCorpusValidationError'
    this.errors = errors
  }
}

export async function validateBenchmarkCorpus(manifest, options = {}) {
  const errors = []
  const schemaResult = validateBenchmarkArtifact(manifest)
  schemaResult.errors.forEach((item) => errors.push(item))
  validateCorpusIdentity(manifest, errors)
  validateSupportedCorpusVersion(manifest, options, errors)

  const assets = manifest && typeof manifest === 'object' ? collectCorpusAssets(manifest) : []
  validateDuplicateAssets(assets, errors)
  await validateAssetFiles(assets, options, errors)

  return { valid: errors.length === 0, errors: sortErrors(errors), value: manifest }
}

export async function finalizeBenchmarkCorpus(manifest, options = {}) {
  const result = await validateBenchmarkCorpus(manifest, options)
  if (!result.valid) throw new BenchmarkCorpusValidationError(result.errors)
  return createBenchmarkCorpusModel(manifest, {
    manifestPath: options.manifestPath || null,
    rootDir: options.rootDir || null,
    checksumsVerified: options.verifyChecksums === true
  })
}

export { BenchmarkArtifactValidationError }
