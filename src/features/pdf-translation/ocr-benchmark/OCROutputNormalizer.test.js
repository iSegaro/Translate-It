import { describe, expect, it } from 'vitest'
import { OCROutputNormalizer } from './OCROutputNormalizer.js'

describe('OCROutputNormalizer', () => {
  it.each([
    ['plain OCR text', 'plain OCR text'],
    [{ text: 'structured OCR text', lines: [], confidence: 95 }, 'structured OCR text']
  ])('normalizes supported OCR output', (providerOutput, text) => {
    const output = new OCROutputNormalizer().normalize(providerOutput)

    expect(output).toEqual({ text })
    expect(Object.isFrozen(output)).toBe(true)
  })

  it('rejects output without direct text', () => {
    expect(() => new OCROutputNormalizer().normalize({ status: 'recognized', data: { text: 'text' } }))
      .toThrow('OCR provider output must contain text')
  })
})
