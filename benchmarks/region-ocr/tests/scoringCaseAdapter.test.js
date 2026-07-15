import { describe, expect, it } from 'vitest'

import { createBenchmarkCorpusModel } from '../corpus/index.js'
import {
  GroundTruthValidationError,
  ScoringCaseValidationError,
  createGroundTruthLookup,
  createScoringCase,
  createScoringCaseAdapter,
  createScoringCases,
  loadGroundTruthCases
} from '../scoring/index.js'
import { ARTIFACT_TYPES } from '../schemas/index.js'

const CREATED_AT = '2026-07-15T12:30:45.123Z'

function createCorpus() {
  return createBenchmarkCorpusModel({
    schemaVersion: '1.0.0',
    artifactType: ARTIFACT_TYPES.CORPUS_MANIFEST,
      artifactId: 'corpus-artifact',
      contentHash: `sha256:${'a'.repeat(64)}`,
      createdAt: CREATED_AT,
      futureDocumentSetMetadata: { retained: true },
      corpusId: 'corpus-01',
    corpusVersion: '1.0.0',
    normalizationPolicy: { id: 'unicode-nfc', version: '1.0.0', parameters: {} },
    documents: [{
      id: 'doc-01',
      file: 'doc.pdf',
      contentHash: `sha256:${'b'.repeat(64)}`,
      documentType: 'vector',
      tags: ['future-doc-tag'],
      futureDocumentField: { retained: true },
      regions: [{
        id: 'region-01',
        pageNumber: 1,
        language: 'eng',
        direction: 'ltr',
        rotation: 0,
        pdfRegion: { left: 1, top: 2, right: 3, bottom: 0 },
        groundTruth: { path: 'truth-01.txt', contentHash: `sha256:${'c'.repeat(64)}`, futureTruthField: { retained: true } },
        futureRegionField: { retained: true }
      }, {
        id: 'region-02',
        pageNumber: 1,
        language: 'eng',
        rotation: 0,
        pdfRegion: { left: 4, top: 5, right: 6, bottom: 3 },
        groundTruth: { path: 'truth-02.txt', contentHash: `sha256:${'d'.repeat(64)}` }
      }]
    }]
  })
}

function rawSample(status, overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    artifactType: ARTIFACT_TYPES.RAW_SAMPLE,
    artifactId: `sample-${status}`,
    contentHash: `sha256:${'e'.repeat(64)}`,
    sampleId: `sample-${status}`,
    caseRef: { documentId: 'doc-01', regionId: 'region-01' },
    status,
    sampleIndex: 0,
    runMode: 'warm',
    recognition: status === 'recognized' ? { rawOutput: { text: 'recognized text' } } : undefined,
    ...overrides
  }
}

async function createLookup() {
  const cases = await loadGroundTruthCases({
    corpus: createCorpus(),
    loadText({ groundTruth }) {
      return groundTruth.path === 'truth-01.txt' ? 'ground truth one' : 'ground truth two'
    }
  })
  return createGroundTruthLookup(cases)
}

describe('Region OCR scoring ground truth and case adapter', () => {
  it('loads immutable ground-truth cases with unknown metadata preserved', async () => {
    const cases = await loadGroundTruthCases({
      corpus: createCorpus(),
      loadText({ groundTruth }) {
        return groundTruth.path
      }
    })

    expect(cases).toHaveLength(2)
    expect(cases[0]).toMatchObject({
      documentId: 'doc-01',
      regionId: 'region-01',
      text: 'truth-01.txt',
      language: 'eng',
      direction: 'ltr'
    })
    expect(cases[0].metadata.region.futureRegionField.retained).toBe(true)
    expect(cases[0].metadata.region.groundTruth.futureTruthField.retained).toBe(true)
    expect(cases[0].metadata.document.futureDocumentField.retained).toBe(true)
    expect(cases[0].metadata.document).not.toHaveProperty('regions')
    expect(Object.isFrozen(cases)).toBe(true)
    expect(Object.isFrozen(cases[0].metadata.document.futureDocumentField)).toBe(true)
    expect(Object.isFrozen(cases[0].metadata.region.futureRegionField)).toBe(true)
    expect(Object.isFrozen(cases[0].metadata.region.groundTruth.futureTruthField)).toBe(true)
  })

  it('collects loadText failures as deterministic structured errors', async () => {
    const visited = []

    await expect(loadGroundTruthCases({
      corpus: createCorpus(),
      loadText({ region }) {
        visited.push(region.id)
        if (region.id === 'region-01') throw new TypeError('missing fixture')
        throw 'primitive failure'
      }
    })).rejects.toMatchObject({
      name: 'GroundTruthValidationError',
      errors: [
        expect.objectContaining({
          code: 'ground_truth_load_failed',
          path: '$.documents[0].regions[0].groundTruth',
          details: {
            documentId: 'doc-01',
            regionId: 'region-01',
            cause: { name: 'TypeError', message: 'missing fixture' }
          }
        }),
        expect.objectContaining({
          code: 'ground_truth_load_failed',
          path: '$.documents[0].regions[1].groundTruth',
          details: {
            documentId: 'doc-01',
            regionId: 'region-02',
            cause: { name: 'Error', message: 'primitive failure' }
          }
        })
      ]
    })
    expect(visited).toEqual(['region-01', 'region-02'])
  })

  it('reports loadText failures even when other entries load successfully', async () => {
    try {
      await loadGroundTruthCases({
        corpus: createCorpus(),
        loadText({ region }) {
          if (region.id === 'region-01') return 'loaded'
          throw new Error('missing second')
        }
      })
    } catch (caught) {
      expect(caught).toBeInstanceOf(GroundTruthValidationError)
      expect(caught.errors).toEqual([
        expect.objectContaining({
          code: 'ground_truth_load_failed',
          path: '$.documents[0].regions[1].groundTruth'
        })
      ])
    }
  })

  it('creates deterministic lookup and rejects duplicate keys', async () => {
    const cases = await loadGroundTruthCases({ corpus: createCorpus(), loadText: () => 'truth' })
    const lookup = createGroundTruthLookup(cases)

    expect(lookup.get('doc-01', 'region-02')).toMatchObject({ text: 'truth' })
    expect(() => createGroundTruthLookup([cases[0], { ...cases[0] }])).toThrow(GroundTruthValidationError)
  })

  it('throws structured error for missing lookup entries', async () => {
    const lookup = createGroundTruthLookup([])

    expect(() => lookup.require('doc-01', 'missing')).toThrow(GroundTruthValidationError)
    try {
      lookup.require('doc-01', 'missing')
    } catch (caught) {
      expect(caught.errors).toContainEqual(expect.objectContaining({ code: 'missing_ground_truth' }))
    }
  })

  it('maps recognized samples to scoring cases with recognized text', async () => {
    const lookup = await createLookup()
    const scoringCase = createScoringCase({ rawSample: rawSample('recognized'), groundTruthLookup: lookup })

    expect(scoringCase).toMatchObject({
      documentId: 'doc-01',
      regionId: 'region-01',
      status: 'recognized',
      recognizedText: 'recognized text',
      groundTruthText: 'ground truth one',
      language: 'eng',
      direction: 'ltr'
    })
    expect(scoringCase).not.toHaveProperty('runRef')
    expect(scoringCase).not.toHaveProperty('corpusRef')
    expect(Object.isFrozen(scoringCase)).toBe(true)
  })

  it.each(['failed', 'cancelled', 'skipped'])('maps %s samples with null recognizedText', async (status) => {
    const lookup = await createLookup()
    const scoringCase = createScoringCase({ rawSample: rawSample(status), groundTruthLookup: lookup })

    expect(scoringCase).toMatchObject({ status, recognizedText: null, groundTruthText: 'ground truth one' })
  })

  it('rejects malformed recognized payload', async () => {
    const lookup = await createLookup()

    expect(() => createScoringCase({
      rawSample: rawSample('recognized', { recognition: { rawOutput: { lines: [] } } }),
      groundTruthLookup: lookup
    })).toThrow(ScoringCaseValidationError)
  })

  it('creates immutable scoring case collections and adapter facade', async () => {
    const lookup = await createLookup()
    const adapter = createScoringCaseAdapter({ groundTruthLookup: lookup })
    const cases = adapter.createCases([rawSample('recognized'), rawSample('skipped')])

    expect(cases).toHaveLength(2)
    expect(Object.isFrozen(cases)).toBe(true)
    expect(Object.isFrozen(cases[0].metadata.groundTruth)).toBe(true)
    expect(adapter.createCase(rawSample('cancelled'))).toMatchObject({ status: 'cancelled' })
  })

  it('returns deterministic validation errors for missing ground truth', async () => {
    const lookup = createGroundTruthLookup([])
    const samples = [rawSample('recognized'), rawSample('failed')]

    const first = (() => {
      try { createScoringCases({ rawSamples: samples, groundTruthLookup: lookup }) } catch (caught) { return caught.errors }
    })()
    const second = (() => {
      try { createScoringCases({ rawSamples: samples, groundTruthLookup: lookup }) } catch (caught) { return caught.errors }
    })()

    expect(second).toEqual(first)
    expect(first.map(({ path }) => path)).toEqual([...first.map(({ path }) => path)].sort())
  })
})
