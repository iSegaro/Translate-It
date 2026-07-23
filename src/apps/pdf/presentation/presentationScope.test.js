import { describe, expect, it } from 'vitest'

import { PRESENTATION_SCOPE, resolvePresentationScope } from './presentationScope.js'

describe('presentationScope', () => {
  it('exports frozen scope constants', () => {
    expect(Object.isFrozen(PRESENTATION_SCOPE)).toBe(true)
  })

  describe('Element scope', () => {
    it('resolves block-loading with blockId to element', () => {
      const result = { type: 'block-translation-loading', blockId: 'b12', pageNumber: 3 }
      expect(resolvePresentationScope(result)).toBe(PRESENTATION_SCOPE.ELEMENT)
    })

    it('resolves block-error with blockId to element', () => {
      const result = { type: 'block-translation-error', blockId: 'b12', pageNumber: 3 }
      expect(resolvePresentationScope(result)).toBe(PRESENTATION_SCOPE.ELEMENT)
    })

    it('resolves page-ocr-complete with pageNumber to element', () => {
      const result = { type: 'page-ocr-complete', pageNumber: 5 }
      expect(resolvePresentationScope(result)).toBe(PRESENTATION_SCOPE.ELEMENT)
    })
  })

  describe('Element scope guard — type must be in known set', () => {
    it('global type with accidental pageNumber stays global', () => {
      const result = { type: 'export-completed', pageNumber: 5 }
      expect(resolvePresentationScope(result)).toBe(PRESENTATION_SCOPE.GLOBAL)
    })

    it('global type with accidental blockId stays global', () => {
      const result = { type: 'comparison-completed', blockId: 'b12' }
      expect(resolvePresentationScope(result)).toBe(PRESENTATION_SCOPE.GLOBAL)
    })

    it('element type without identifiers falls back to global', () => {
      const result = { type: 'block-translation-loading' }
      expect(resolvePresentationScope(result)).toBe(PRESENTATION_SCOPE.GLOBAL)
    })
  })

  describe('Component scope', () => {
    it('resolves pane-empty to component', () => {
      const result = { type: 'pane-empty', pane: 'translated' }
      expect(resolvePresentationScope(result)).toBe(PRESENTATION_SCOPE.COMPONENT)
    })
  })

  describe('Global scope', () => {
    const cases = [
      'export-completed',
      'export-failed',
      'comparison-completed',
      'comparison-failed',
      'comparison-progress',
      'ocr-completed',
      'ocr-failed',
      'ocr-language-missing',
      'ocr-progress',
      'region-ocr-completed',
      'region-ocr-failed',
      'region-ocr-no-text',
      'region-ocr-progress',
      'translation-progress',
      'translation-partial'
    ]

    cases.forEach((type) => {
      it(`resolves ${type} to global`, () => {
        expect(resolvePresentationScope({ type })).toBe(PRESENTATION_SCOPE.GLOBAL)
      })
    })
  })

  describe('edge cases', () => {
    it('returns global for null input', () => {
      expect(resolvePresentationScope(null)).toBe(PRESENTATION_SCOPE.GLOBAL)
    })

    it('returns global for empty object', () => {
      expect(resolvePresentationScope({})).toBe(PRESENTATION_SCOPE.GLOBAL)
    })
  })

  it('is pure — same input yields same output', () => {
    const result = { type: 'export-completed' }
    expect(resolvePresentationScope(result)).toBe(resolvePresentationScope(result))
  })
})
