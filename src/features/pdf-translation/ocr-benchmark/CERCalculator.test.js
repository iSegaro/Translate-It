import { describe, expect, it } from 'vitest'
import { CERCalculator } from './CERCalculator.js'

describe('CERCalculator', () => {
  const calculator = new CERCalculator()

  it.each([
    ['identical strings', 'text', 'text', 0, 4],
    ['an insertion', 'text', 'texts', 1, 4],
    ['a deletion', 'texts', 'text', 1, 5],
    ['a substitution', 'text', 'test', 1, 4],
    ['Unicode code points', '猫犬', '猫鳥', 1, 2]
  ])('calculates CER for %s', (_scenario, reference, recognized, editDistance, referenceCharacterCount) => {
    const result = calculator.calculate(reference, recognized)

    expect(result).toEqual({
      editDistance,
      referenceCharacterCount,
      characterErrorRate: editDistance / referenceCharacterCount
    })
    expect(Object.isFrozen(result)).toBe(true)
  })

  it.each([null, undefined, {}, 1])('rejects invalid inputs', (invalidInput) => {
    expect(() => calculator.calculate(invalidInput, 'text')).toThrow(TypeError)
    expect(() => calculator.calculate('text', invalidInput)).toThrow(TypeError)
  })

  it('rejects an empty reference string', () => {
    expect(() => calculator.calculate('', 'text')).toThrow(RangeError)
  })
})
