import { describe, expect, it } from 'vitest'
import { TextNormalizer } from './TextNormalizer.js'

describe('TextNormalizer', () => {
  const normalizer = new TextNormalizer()

  it('normalizes Unicode to NFC', () => {
    expect(normalizer.normalize('Cafe\u0301')).toBe('Café')
  })

  it.each([
    ['CRLF', 'first\r\nsecond', 'first\nsecond'],
    ['CR', 'first\rsecond', 'first\nsecond'],
    ['LF', 'first\nsecond', 'first\nsecond']
  ])('normalizes %s line endings', (_name, input, expected) => {
    expect(normalizer.normalize(input)).toBe(expected)
  })

  it.each([null, undefined, {}, 1])('rejects non-string input', (input) => {
    expect(() => normalizer.normalize(input)).toThrow(TypeError)
  })
})
