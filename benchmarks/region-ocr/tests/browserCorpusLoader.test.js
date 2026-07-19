import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import {
  BrowserBenchmarkCorpusError,
  loadBrowserBenchmarkCorpus,
  resolveBrowserCorpusAssetUrl
} from '../corpus/loadBrowserCorpus.js'

const corpusRoot = new URL('../corpus/', import.meta.url)
const manifestUrl = new URL('manifest.json', corpusRoot).href

async function fixtureBytes(relativePath) {
  return new Uint8Array(await readFile(new URL(relativePath, corpusRoot)))
}

function response(bytes, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
}

async function fixtureFetch(url) {
  const resolved = new URL(url)
  if (resolved.href === manifestUrl) return response(await fixtureBytes('manifest.json'))
  if (resolved.href === new URL('fixtures/region-ocr-smoke.pdf', corpusRoot).href) return response(await fixtureBytes('fixtures/region-ocr-smoke.pdf'))
  if (resolved.href === new URL('ground-truth/alpha.txt', corpusRoot).href) return response(await fixtureBytes('ground-truth/alpha.txt'))
  if (resolved.href === new URL('ground-truth/bravo.txt', corpusRoot).href) return response(await fixtureBytes('ground-truth/bravo.txt'))
  return response(new Uint8Array(), 404)
}

describe('browser corpus loader', () => {
  it('loads frozen manifest, PDF bytes, and UTF-8 ground truth in manifest order', async () => {
    const loaded = await loadBrowserBenchmarkCorpus({ manifestUrl, fetchImpl: fixtureFetch })

    expect(loaded.corpus.corpusId).toBe('region-ocr-smoke')
    expect(loaded.assets.map(asset => asset.path)).toEqual([
      'fixtures/region-ocr-smoke.pdf',
      'ground-truth/alpha.txt',
      'ground-truth/bravo.txt'
    ])
    expect(loaded.assets[0].bytes).toBeInstanceOf(Uint8Array)
    expect(loaded.assets[1].text).toBe('Region OCR Fixture Alpha\n')
    expect(loaded.assets[2].text).toBe('Second line Bravo 42\n')
    expect(Object.isFrozen(loaded)).toBe(true)
    expect(Object.isFrozen(loaded.assets)).toBe(true)
    expect(Object.isFrozen(loaded.assets[0])).toBe(true)
  })

  it('resolves assets relative to the manifest without escaping corpus root', () => {
    expect(resolveBrowserCorpusAssetUrl(manifestUrl, 'fixtures/region-ocr-smoke.pdf')).toBe(
      new URL('fixtures/region-ocr-smoke.pdf', corpusRoot).href
    )
    expect(() => resolveBrowserCorpusAssetUrl(manifestUrl, '../outside.pdf')).toThrow(BrowserBenchmarkCorpusError)
  })

  it('rejects fetch failures', async () => {
    await expect(loadBrowserBenchmarkCorpus({
      manifestUrl,
      fetchImpl: async () => response(new Uint8Array(), 404)
    })).rejects.toMatchObject({
      errors: [expect.objectContaining({ code: 'asset_fetch_failed' })]
    })
  })

  it('rejects invalid manifests', async () => {
    const invalid = new TextEncoder().encode('{')
    await expect(loadBrowserBenchmarkCorpus({
      manifestUrl,
      fetchImpl: async () => response(invalid)
    })).rejects.toMatchObject({
      errors: [expect.objectContaining({ code: 'invalid_manifest_json' })]
    })
  })

  it('rejects asset hash mismatches', async () => {
    const originalFetch = fixtureFetch
    await expect(loadBrowserBenchmarkCorpus({
      manifestUrl,
      fetchImpl: async (url) => {
        if (new URL(url).href === new URL('ground-truth/alpha.txt', corpusRoot).href) {
          return response(new TextEncoder().encode('changed'))
        }
        return originalFetch(url)
      }
    })).rejects.toMatchObject({
      errors: [expect.objectContaining({ code: 'checksum_mismatch' })]
    })
  })
})
