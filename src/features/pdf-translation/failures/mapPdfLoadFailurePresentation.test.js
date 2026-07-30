import { describe, expect, it } from 'vitest'
import { mapPdfLoadFailurePresentation } from './mapPdfLoadFailurePresentation.js'

describe('mapPdfLoadFailurePresentation', () => {
  it('maps TIMEOUT with retryable=true', () => {
    const result = mapPdfLoadFailurePresentation({ kind: 'TIMEOUT', details: {} })

    expect(result).toMatchObject({ title: 'Connection timed out', retryable: true, severity: 'error' })
  })

  it('maps HTTP as non-retryable', () => {
    const result = mapPdfLoadFailurePresentation({ kind: 'HTTP', details: { status: 502 } })

    expect(result).toMatchObject({ retryable: false, icon: 'warning' })
  })

  it.each([
    ['DOCUMENT_CLEANUP', false],
    ['DOCUMENT_LOAD', false],
    ['DOCUMENT_INITIALIZATION', false],
    ['PAGE_METRICS', false],
  ])('maps %s as non-retryable', (kind, retryable) => {
    expect(mapPdfLoadFailurePresentation({ kind, details: {} })).toMatchObject({ retryable })
  })

  it('returns expected object shape for every kind', () => {
    const expectedKeys = ['title', 'description', 'severity', 'retryable', 'icon']

    for (const kind of ['TIMEOUT', 'HTTP', 'DOCUMENT_CLEANUP', 'DOCUMENT_LOAD', 'DOCUMENT_INITIALIZATION', 'PAGE_METRICS', 'UNEXPECTED']) {
      const result = mapPdfLoadFailurePresentation({ kind, details: {} })

      expect(Object.keys(result).sort()).toEqual(expectedKeys.sort())
      expect(typeof result.title).toBe('string')
      expect(typeof result.description).toBe('string')
      expect(typeof result.severity).toBe('string')
      expect(typeof result.retryable).toBe('boolean')
      expect(typeof result.icon).toBe('string')
    }
  })

  it('maps unknown kinds to non-retryable defaults', () => {
    const result = mapPdfLoadFailurePresentation({ kind: 'MADE_UP', details: {} })

    expect(result).toMatchObject({ retryable: false, icon: 'error', title: 'Could not open document' })
  })

  it('returns an immutable presentation', () => {
    const result = mapPdfLoadFailurePresentation({ kind: 'TIMEOUT', details: {} })

    expect(Object.isFrozen(result)).toBe(true)
  })

  it('returns the same singleton for repeated mapping of the same kind', () => {
    expect(
      mapPdfLoadFailurePresentation({ kind: 'TIMEOUT', details: {} })
    ).toBe(
      mapPdfLoadFailurePresentation({ kind: 'TIMEOUT', details: {} })
    )
  })

  it('handles null failure gracefully', () => {
    expect(mapPdfLoadFailurePresentation(null)).toMatchObject({ retryable: false, icon: 'error' })
  })
})
