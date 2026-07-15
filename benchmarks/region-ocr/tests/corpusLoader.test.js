import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ARTIFACT_TYPES, SCHEMA_VERSIONS } from '../schemas/index.js'
import {
  BenchmarkCorpusValidationError,
  calculateFileContentHash,
  finalizeBenchmarkCorpus,
  loadBenchmarkCorpus,
  validateBenchmarkCorpus
} from '../corpus/index.js'

const CREATED_AT = '2026-07-15T12:30:45.123Z'
const MANIFEST_HASH = `sha256:${'b'.repeat(64)}`

const tempDirs = []

async function createTempCorpus() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'region-ocr-corpus-'))
  tempDirs.push(rootDir)

  await writeFile(path.join(rootDir, 'document.pdf'), 'fake-pdf-content')
  await writeFile(path.join(rootDir, 'truth.txt'), 'ground truth text')

  const pdfHash = await calculateFileContentHash(path.join(rootDir, 'document.pdf'))
  const truthHash = await calculateFileContentHash(path.join(rootDir, 'truth.txt'))
  const manifest = createManifest({ pdfHash, truthHash })
  const manifestPath = path.join(rootDir, 'manifest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  return { rootDir, manifestPath, manifest, pdfHash, truthHash }
}

function createManifest({ pdfHash, truthHash }) {
  return {
    schemaVersion: SCHEMA_VERSIONS[ARTIFACT_TYPES.CORPUS_MANIFEST],
    artifactType: ARTIFACT_TYPES.CORPUS_MANIFEST,
    artifactId: 'corpus-artifact',
    contentHash: MANIFEST_HASH,
    createdAt: CREATED_AT,
    corpusId: 'region-ocr-corpus',
    corpusVersion: '1.0.0',
    normalizationPolicy: { id: 'unicode-nfc', version: '1.0.0', parameters: {} },
    documents: [{
      id: 'document-01',
      file: 'document.pdf',
      contentHash: pdfHash,
      documentType: 'vector',
      regions: [{
        id: 'region-01',
        pageNumber: 1,
        language: 'eng',
        rotation: 0,
        pdfRegion: { left: 10, top: 20, right: 30, bottom: 5 },
        groundTruth: {
          path: 'truth.txt',
          contentHash: truthHash
        },
        tags: ['smoke']
      }],
      tags: ['pdf']
    }],
    futureTopLevel: { preserved: true }
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('Region OCR benchmark corpus loader', () => {
  it('loads a valid immutable corpus with verified checksums', async () => {
    const { manifestPath } = await createTempCorpus()

    const corpus = await loadBenchmarkCorpus(manifestPath, { verifyChecksums: true })

    expect(corpus.corpusId).toBe('region-ocr-corpus')
    expect(corpus.metadata.checksumsVerified).toBe(true)
    expect(corpus.assets).toHaveLength(2)
    expect(Object.isFrozen(corpus)).toBe(true)
    expect(Object.isFrozen(corpus.manifest.documents[0].regions[0])).toBe(true)
    expect(() => {
      corpus.manifest.documents[0].id = 'mutated'
    }).toThrow(TypeError)
  })

  it('preserves unknown manifest fields in the immutable model', async () => {
    const { manifest, rootDir } = await createTempCorpus()

    const corpus = await finalizeBenchmarkCorpus(manifest, { rootDir })

    expect(corpus.manifest.futureTopLevel.preserved).toBe(true)
    expect(Object.isFrozen(corpus.manifest.futureTopLevel)).toBe(true)
  })

  it('accepts historical corpus versions that still match the manifest schema', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.corpusVersion = '0.1.0'

    await expect(finalizeBenchmarkCorpus(manifest, { rootDir })).resolves.toMatchObject({
      corpusVersion: '0.1.0'
    })
  })

  it('rejects unsupported corpus versions when an allowlist is provided', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.corpusVersion = '0.1.0'

    const result = await validateBenchmarkCorpus(manifest, {
      rootDir,
      supportedCorpusVersions: ['1.0.0']
    })

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'unsupported_corpus_version',
      path: '$.corpusVersion'
    }))
  })

  it('rejects invalid manifests with structured schema errors', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    delete manifest.documents

    const result = await validateBenchmarkCorpus(manifest, { rootDir })

    expect(result).toMatchObject({ valid: false })
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'missing_required_field',
      path: '$.documents'
    }))
  })

  it('rejects duplicate document and region identifiers', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.documents.push(structuredClone(manifest.documents[0]))
    manifest.documents[0].regions.push(structuredClone(manifest.documents[0].regions[0]))

    const result = await validateBenchmarkCorpus(manifest, { rootDir })

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_identifier',
      path: '$.documents[1]'
    }))
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_identifier',
      path: '$.documents[0].regions[1]'
    }))
  })

  it('rejects invalid references and malformed metadata', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.documents[0].file = '../document.pdf'
    manifest.createdAt = 'not-a-timestamp'

    const result = await validateBenchmarkCorpus(manifest, { rootDir })

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'invalid_relative_path',
      path: '$.documents[0].file'
    }))
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: expect.stringMatching(/invalid_(pattern|timestamp)/),
      path: '$.createdAt'
    }))
  })

  it('rejects missing referenced files', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.documents[0].regions[0].groundTruth.path = 'missing.txt'

    const result = await validateBenchmarkCorpus(manifest, { rootDir })

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'missing_asset',
      path: '$.documents[0].regions[0].groundTruth.path'
    }))
  })

  it('rejects duplicate asset paths', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.documents[0].regions.push({
      ...structuredClone(manifest.documents[0].regions[0]),
      id: 'region-02'
    })

    const result = await validateBenchmarkCorpus(manifest, { rootDir })

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'duplicate_asset',
      path: '$.documents[0].regions[1].groundTruth.path'
    }))
  })

  it('verifies checksum matches when requested', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.documents[0].contentHash = `sha256:${'c'.repeat(64)}`

    const result = await validateBenchmarkCorpus(manifest, { rootDir, verifyChecksums: true })

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'checksum_mismatch',
      path: '$.documents[0].contentHash'
    }))
  })

  it('allows checksum verification to be disabled for lightweight loading', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.documents[0].contentHash = `sha256:${'c'.repeat(64)}`

    await expect(finalizeBenchmarkCorpus(manifest, { rootDir, verifyChecksums: false })).resolves.toMatchObject({
      metadata: { checksumsVerified: false }
    })
  })

  it('rejects symlink asset escapes even when checksum verification is disabled', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    const outsideDir = await mkdtemp(path.join(os.tmpdir(), 'region-ocr-outside-'))
    tempDirs.push(outsideDir)
    const outsideFile = path.join(outsideDir, 'outside.pdf')
    await writeFile(outsideFile, 'outside')

    try {
      await symlink(outsideFile, path.join(rootDir, 'linked.pdf'))
    } catch {
      return
    }

    manifest.documents[0].file = 'linked.pdf'
    manifest.documents[0].contentHash = await calculateFileContentHash(outsideFile)

    const result = await validateBenchmarkCorpus(manifest, { rootDir, verifyChecksums: false })

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'invalid_asset_reference',
      path: '$.documents[0].file'
    }))
  })

  it('rejects directory assets', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    await mkdir(path.join(rootDir, 'asset-dir'))
    manifest.documents[0].file = 'asset-dir'

    const result = await validateBenchmarkCorpus(manifest, { rootDir, verifyChecksums: false })

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'invalid_asset_type',
      path: '$.documents[0].file'
    }))
  })

  it('rejects malformed UTF-8 ground truth', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    await writeFile(path.join(rootDir, 'bad-utf8.txt'), Uint8Array.from([0xc3, 0x28]))
    manifest.documents[0].regions[0].groundTruth.path = 'bad-utf8.txt'
    manifest.documents[0].regions[0].groundTruth.contentHash = await calculateFileContentHash(
      path.join(rootDir, 'bad-utf8.txt')
    )

    const result = await validateBenchmarkCorpus(manifest, { rootDir, verifyChecksums: false })

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'invalid_ground_truth_encoding',
      path: '$.documents[0].regions[0].groundTruth.path'
    }))
  })

  it('accepts valid UTF-8 ground truth with checksum verification disabled', async () => {
    const { manifest, rootDir } = await createTempCorpus()

    const result = await validateBenchmarkCorpus(manifest, { rootDir, verifyChecksums: false })

    expect(result).toMatchObject({ valid: true, errors: [] })
  })

  it('rejects unsupported schema versions', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.schemaVersion = '2.0.0'

    const result = await validateBenchmarkCorpus(manifest, { rootDir })

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'unsupported_schema_version',
      path: '$.schemaVersion'
    }))
  })

  it('throws structured errors for invalid JSON manifests', async () => {
    const { rootDir } = await createTempCorpus()
    const manifestPath = path.join(rootDir, 'broken.json')
    await writeFile(manifestPath, '{')

    await expect(loadBenchmarkCorpus(manifestPath)).rejects.toMatchObject({
      name: 'BenchmarkCorpusValidationError',
      errors: [expect.objectContaining({ code: 'invalid_manifest_json', path: '$' })]
    })
  })

  it('returns deterministic validation errors', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.documents[0].file = '../document.pdf'
    manifest.documents[0].contentHash = 'invalid'
    manifest.documents[0].regions[0].groundTruth.path = ''

    const first = (await validateBenchmarkCorpus(structuredClone(manifest), { rootDir })).errors
    const second = (await validateBenchmarkCorpus(structuredClone(manifest), { rootDir })).errors

    expect(second).toEqual(first)
    expect(first.map(({ path: errorPath }) => errorPath)).toEqual(
      [...first.map(({ path: errorPath }) => errorPath)].sort()
    )
  })

  it('throws corpus validation errors instead of returning mutable invalid models', async () => {
    const { manifest, rootDir } = await createTempCorpus()
    manifest.artifactType = ARTIFACT_TYPES.RAW_RUN

    await expect(finalizeBenchmarkCorpus(manifest, { rootDir })).rejects.toBeInstanceOf(
      BenchmarkCorpusValidationError
    )
  })
})
