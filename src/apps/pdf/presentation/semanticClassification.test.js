import { describe, expect, it } from 'vitest'

import { classify, SEMANTIC_CATEGORY } from './semanticClassification.js'

describe('semanticClassification', () => {
  it('exports frozen category constants', () => {
    expect(Object.isFrozen(SEMANTIC_CATEGORY)).toBe(true)
  })

  describe('Acknowledgement', () => {
    const cases = [
      'export-completed',
      'export-failed',
      'ocr-completed',
      'ocr-failed',
      'ocr-language-missing',
      'region-ocr-completed',
      'region-ocr-failed',
      'region-ocr-no-text',
      'pane-empty',
      'page-ocr-complete'
    ]

    cases.forEach((type) => {
      it(`classifies ${type} as acknowledgement`, () => {
        expect(classify({ type })).toBe(SEMANTIC_CATEGORY.ACKNOWLEDGEMENT)
      })
    })
  })

  describe('Persistent Information', () => {
    const cases = [
      'comparison-completed',
      'comparison-failed',
      'translation-partial',
      'block-translation-error'
    ]

    cases.forEach((type) => {
      it(`classifies ${type} as persistent-information`, () => {
        expect(classify({ type })).toBe(SEMANTIC_CATEGORY.PERSISTENT_INFORMATION)
      })
    })
  })

  describe('Progress', () => {
    const cases = [
      'translation-progress',
      'ocr-progress',
      'region-ocr-progress',
      'comparison-progress',
      'block-translation-loading'
    ]

    cases.forEach((type) => {
      it(`classifies ${type} as progress`, () => {
        expect(classify({ type })).toBe(SEMANTIC_CATEGORY.PROGRESS)
      })
    })
  })

  describe('fallback', () => {
    it('falls back to acknowledgement for unknown type', () => {
      expect(classify({ type: 'nonexistent-type' })).toBe(SEMANTIC_CATEGORY.ACKNOWLEDGEMENT)
    })

    it('falls back to acknowledgement for null input', () => {
      expect(classify(null)).toBe(SEMANTIC_CATEGORY.ACKNOWLEDGEMENT)
    })

    it('falls back to acknowledgement for empty object', () => {
      expect(classify({})).toBe(SEMANTIC_CATEGORY.ACKNOWLEDGEMENT)
    })

    it('falls back to acknowledgement for undefined type', () => {
      expect(classify({ type: undefined })).toBe(SEMANTIC_CATEGORY.ACKNOWLEDGEMENT)
    })
  })

  it('classify is pure — same input yields same output', () => {
    const result = { type: 'comparison-completed' }
    expect(classify(result)).toBe(classify(result))
    expect(classify({ type: 'export-completed' })).toBe(classify({ type: 'export-completed' }))
  })
})
