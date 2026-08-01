import { describe, expect, it } from 'vitest'
import { mapOcrError } from './ocrErrorMapper.js'

describe('mapOcrError', () => {
  it('preserves the missing model error code', () => {
    expect(mapOcrError(new Error('model-not-installed'))).toBe('model-not-installed')
  })

  it('classifies cancellation errors', () => {
    expect(mapOcrError(new Error('cancelled'))).toBe('cancelled')
    expect(mapOcrError({ name: 'RenderingCancelledException' })).toBe('cancelled')
  })

  it('maps unknown errors to the generic OCR failure code', () => {
    expect(mapOcrError(new Error('Tesseract worker crashed'))).toBe('ocr-failed')
  })
})
