import { describe, expect, it } from 'vitest'
import { mapOcrError } from './ocrErrorMapper.js'

describe('mapOcrError', () => {
  it.each([
    ['string', 'model-not-installed'],
    ['Error', new Error('model-not-installed')],
    ['legacy error object', { message: 'model-not-installed', type: 'OCR_FAILED' }],
  ])('preserves the missing model error code from %s', (_label, error) => {
    expect(mapOcrError(error)).toBe('model-not-installed')
  })

  it.each([
    'cancelled',
    new Error('cancelled'),
    { message: 'cancelled', type: 'OCR_CANCELLED' },
    { name: 'RenderingCancelledException' },
  ])('classifies cancellation error %o', (error) => {
    expect(mapOcrError(error)).toBe('cancelled')
  })

  it('preserves no-text from a string response', () => {
    expect(mapOcrError('no-text')).toBe('no-text')
  })

  it.each([
    new Error('Tesseract worker crashed'),
    { message: 'Tesseract worker crashed', type: 'OCR_FAILED' },
    { message: { unexpected: true }, type: 'OCR_FAILED' },
  ])('maps unknown errors safely to the generic OCR failure code', (error) => {
    expect(mapOcrError(error)).toBe('ocr-failed')
    expect(mapOcrError(error)).not.toBe('[object Object]')
  })
})
