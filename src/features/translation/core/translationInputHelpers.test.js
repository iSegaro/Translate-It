import { describe, expect, it, vi } from 'vitest'

import {
  isEmptyTranslationInput,
  getTranslationInputPreview,
  getTranslationInputLength,
  isStructuredBatchInput
} from './translationInputHelpers.js'

describe('translationInputHelpers', () => {
  describe('isEmptyTranslationInput', () => {
    it('returns true for null/undefined', () => {
      expect(isEmptyTranslationInput(null)).toBe(true)
      expect(isEmptyTranslationInput(undefined)).toBe(true)
    })

    it('returns true for empty string', () => {
      expect(isEmptyTranslationInput('')).toBe(true)
      expect(isEmptyTranslationInput('   ')).toBe(true)
    })

    it('returns false for non-empty string', () => {
      expect(isEmptyTranslationInput('hello')).toBe(false)
    })

    it('returns true for empty array', () => {
      expect(isEmptyTranslationInput([])).toBe(true)
    })

    it('returns false for non-empty array', () => {
      expect(isEmptyTranslationInput([{ t: 'hello' }])).toBe(false)
    })

    it('returns true for non-string/non-array objects', () => {
      expect(isEmptyTranslationInput({})).toBe(true)
    })
  })

  describe('getTranslationInputPreview', () => {
    it('returns substring for strings', () => {
      expect(getTranslationInputPreview('hello world', 5)).toBe('hello')
    })

    it('returns batch label for arrays', () => {
      expect(getTranslationInputPreview([{ t: 'a' }, { t: 'b' }])).toBe('[batch:2]')
    })

    it('returns empty for non-string/non-array', () => {
      expect(getTranslationInputPreview(42)).toBe('')
    })

    it('returns empty for null', () => {
      expect(getTranslationInputPreview(null)).toBe('')
    })
  })

  describe('getTranslationInputLength', () => {
    it('returns character count for strings', () => {
      expect(getTranslationInputLength('hello')).toBe(5)
    })

    it('returns item count for arrays', () => {
      expect(getTranslationInputLength([{ t: 'a' }, { t: 'b' }, { t: 'c' }])).toBe(3)
    })

    it('returns 0 for null', () => {
      expect(getTranslationInputLength(null)).toBe(0)
    })
  })

  describe('isStructuredBatchInput', () => {
    it('returns true for arrays', () => {
      expect(isStructuredBatchInput([{ t: 'hello' }])).toBe(true)
    })

    it('returns false for strings', () => {
      expect(isStructuredBatchInput('hello')).toBe(false)
    })

    it('returns false for null', () => {
      expect(isStructuredBatchInput(null)).toBe(false)
    })
  })
})
