import { describe, expect, it } from 'vitest'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'
import { BenchmarkArtifactWriter } from './BenchmarkArtifactWriter.js'

describe('BenchmarkArtifactWriter', () => {
  it('writes an immutable deterministic artifact in execution order', () => {
    const evaluation = Object.freeze({ cer: Object.freeze({ characterErrorRate: 0.2 }) })
    const first = Object.freeze({ candidateId: 'scale-1-eng', evaluation })
    const second = Object.freeze({ candidateId: 'scale-1.5-eng' })
    const sessionResult = Object.freeze({
      summary: Object.freeze({ totalCandidates: 2, completedCandidates: 2, startedAt: 100, completedAt: 120, totalElapsedMs: 20 }),
      candidates: Object.freeze([
        Object.freeze({ candidateId: 'scale-1-eng', configuration: Object.freeze({ scale: 1, language: 'eng' }) }),
        Object.freeze({ candidateId: 'scale-1.5-eng', configuration: Object.freeze({ scale: 1.5, language: 'eng' }) })
      ]),
      results: Object.freeze([first, second])
    })
    const writer = new BenchmarkArtifactWriter({ clock: () => '2026-07-19T00:00:00.000Z' })

    const profile = Object.freeze({ id: 'default-region-ocr', name: 'Default Region OCR' })
    const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })
    const artifact = writer.write(sessionResult, { profile, region })
    const repeatedArtifact = writer.write(sessionResult, { profile, region })

    expect(artifact).toEqual({
      schemaVersion: '1.0.0',
      artifactType: 'region-benchmark',
      generatedAt: '2026-07-19T00:00:00.000Z',
      profile,
      metadata: { startedAt: 100, completedAt: 120, totalElapsedMs: 20, profileId: 'default-region-ocr', pageNumber: 1, region },
      summary: sessionResult.summary,
      configurations: [
        { candidateId: 'scale-1-eng', configuration: { scale: 1, language: 'eng' } },
        { candidateId: 'scale-1.5-eng', configuration: { scale: 1.5, language: 'eng' } }
      ],
      results: [first, second]
    })
    expect(artifact.results[0].evaluation).toBe(evaluation)
    expect(repeatedArtifact).toEqual(artifact)
    expect(Object.isFrozen(artifact)).toBe(true)
    expect(Object.isFrozen(artifact.configurations)).toBe(true)
    expect(Object.isFrozen(artifact.configurations[0])).toBe(true)
    expect(Object.isFrozen(artifact.results)).toBe(true)
  })
})
