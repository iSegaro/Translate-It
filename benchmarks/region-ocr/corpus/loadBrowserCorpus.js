import { ARTIFACT_TYPES, validateBenchmarkArtifact } from '../schemas/index.js'
import { collectCorpusAssets, createBenchmarkCorpusModel } from './corpusModel.js'

function error(code, path, message, details) {
  return details === undefined ? { code, path, message } : { code, path, message, details }
}

function sortErrors(errors) {
  return errors.sort((left, right) => (
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message)
  ))
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || value instanceof ArrayBuffer || seen.has(value)) return value
  seen.add(value)
  Object.values(value).forEach(child => deepFreeze(child, seen))
  return Object.freeze(value)
}

function isSafeRelativePath(value) {
  if (!value || value.startsWith('/') || value.startsWith('\\')) return false
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.includes('\\')) return false
  return !value.split('/').some(segment => segment === '..' || segment === '')
}

export class BrowserBenchmarkCorpusError extends Error {
  constructor(errors) {
    super('Browser benchmark corpus loading failed')
    this.name = 'BrowserBenchmarkCorpusError'
    this.errors = errors
  }
}

export function resolveBrowserCorpusAssetUrl(manifestUrl, assetPath) {
  if (!isSafeRelativePath(assetPath)) {
    throw new BrowserBenchmarkCorpusError([error('invalid_relative_path', '$.asset', 'Asset path must be relative', { path: assetPath })])
  }

  const manifest = new URL(manifestUrl)
  const root = new URL('.', manifest)
  const asset = new URL(assetPath, root)
  if (asset.origin !== root.origin || !asset.pathname.startsWith(root.pathname)) {
    throw new BrowserBenchmarkCorpusError([error('invalid_asset_reference', '$.asset', 'Asset path must stay within corpus root', { path: assetPath })])
  }

  return asset.href
}

export async function calculateBrowserContentHash(bytes, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle?.digest) {
    throw new BrowserBenchmarkCorpusError([error('crypto_unavailable', '$', 'Web Crypto SHA-256 is required')])
  }

  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const digest = await cryptoApi.subtle.digest('SHA-256', source)
  return `sha256:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

async function fetchBytes(fetchImpl, url, path) {
  let response
  try {
    response = await fetchImpl(url)
  } catch (cause) {
    throw new BrowserBenchmarkCorpusError([error('asset_fetch_failed', path, 'Asset fetch failed', { url, cause: String(cause) })])
  }
  if (!response?.ok) {
    throw new BrowserBenchmarkCorpusError([error('asset_fetch_failed', path, 'Asset fetch failed', { url, status: response?.status ?? 0 })])
  }

  return new Uint8Array(await response.arrayBuffer())
}

function validateManifest(manifest, supportedCorpusVersions) {
  const errors = [...validateBenchmarkArtifact(manifest).errors]
  if (manifest?.artifactType !== ARTIFACT_TYPES.CORPUS_MANIFEST) {
    errors.push(error('invalid_corpus_manifest', '$.artifactType', 'Artifact must be a corpus manifest'))
  }
  if (Array.isArray(supportedCorpusVersions) && !supportedCorpusVersions.includes(manifest?.corpusVersion)) {
    errors.push(error('unsupported_corpus_version', '$.corpusVersion', 'Corpus version is not supported', {
      supported: [...supportedCorpusVersions]
    }))
  }

  const assets = manifest && typeof manifest === 'object' ? collectCorpusAssets(manifest) : []
  const paths = new Map()
  assets.forEach(asset => {
    if (!isSafeRelativePath(asset.path)) {
      errors.push(error('invalid_relative_path', asset.schemaPath, 'Asset path must be relative', { path: asset.path }))
      return
    }
    if (paths.has(asset.path)) {
      errors.push(error('duplicate_asset', asset.schemaPath, 'Asset path must be unique within corpus', {
        path: asset.path,
        firstPath: paths.get(asset.path)
      }))
      return
    }
    paths.set(asset.path, asset.schemaPath)
  })

  if (errors.length > 0) throw new BrowserBenchmarkCorpusError(sortErrors(errors))
}

function parseManifest(bytes, url) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (cause) {
    throw new BrowserBenchmarkCorpusError([error('invalid_manifest_json', '$', 'Corpus manifest must be valid UTF-8 JSON', {
      url,
      cause: String(cause)
    })])
  }
}

async function loadAsset({ fetchImpl, manifestUrl, asset, verifyChecksums, cryptoApi }) {
  const url = resolveBrowserCorpusAssetUrl(manifestUrl, asset.path)
  const bytes = await fetchBytes(fetchImpl, url, asset.schemaPath)
  if (verifyChecksums) {
    const actualHash = await calculateBrowserContentHash(bytes, cryptoApi)
    if (actualHash !== asset.contentHash) {
      throw new BrowserBenchmarkCorpusError([error('checksum_mismatch', asset.hashPath, 'Asset checksum does not match content', {
        path: asset.path,
        expectedHash: asset.contentHash,
        actualHash
      })])
    }
  }

  if (asset.kind === 'ground-truth') {
    try {
      return { ...asset, url, bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    } catch {
      throw new BrowserBenchmarkCorpusError([error('invalid_ground_truth_encoding', asset.schemaPath, 'Ground-truth asset must be valid UTF-8', {
        path: asset.path
      })])
    }
  }

  return { ...asset, url, bytes }
}

export async function loadBrowserBenchmarkCorpus({
  manifestUrl,
  fetchImpl = globalThis.fetch,
  cryptoApi = globalThis.crypto,
  verifyChecksums = true,
  supportedCorpusVersions
} = {}) {
  if (!manifestUrl) throw new TypeError('loadBrowserBenchmarkCorpus requires manifestUrl')
  if (typeof fetchImpl !== 'function') throw new TypeError('loadBrowserBenchmarkCorpus requires fetch')

  const manifestBytes = await fetchBytes(fetchImpl, manifestUrl, '$')
  const manifest = parseManifest(manifestBytes, manifestUrl)
  validateManifest(manifest, supportedCorpusVersions)

  const assets = []
  for (const asset of collectCorpusAssets(manifest)) {
    assets.push(await loadAsset({ fetchImpl, manifestUrl, asset, verifyChecksums, cryptoApi }))
  }

  const corpus = createBenchmarkCorpusModel(manifest, {
    manifestUrl,
    rootUrl: new URL('.', manifestUrl).href,
    checksumsVerified: verifyChecksums
  })

  return deepFreeze({ corpus, assets })
}
