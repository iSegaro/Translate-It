import { describe, expect, it } from 'vitest'
import { createPdfRegion } from './PdfRegion.js'

const validRegion = {
  pageNumber: 1,
  left: 10,
  top: 80,
  right: 60,
  bottom: 20
}

describe('createPdfRegion', () => {
  it('creates a valid canonical region with a positive one-based page number', () => {
    expect(createPdfRegion(validRegion)).toEqual(validRegion)
    expect(createPdfRegion({ ...validRegion, pageNumber: 4 })).toEqual({
      ...validRegion,
      pageNumber: 4
    })
  })

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity])('rejects invalid page number %s', (pageNumber) => {
    expect(createPdfRegion({ ...validRegion, pageNumber })).toBeNull()
  })

  it.each(['left', 'top', 'right', 'bottom'])('rejects a non-finite %s coordinate', (field) => {
    expect(createPdfRegion({ ...validRegion, [field]: NaN })).toBeNull()
    expect(createPdfRegion({ ...validRegion, [field]: Infinity })).toBeNull()
  })

  it('rejects inverted horizontal bounds', () => {
    expect(createPdfRegion({ ...validRegion, left: 70 })).toBeNull()
  })

  it('rejects inverted vertical bounds', () => {
    expect(createPdfRegion({ ...validRegion, bottom: 90 })).toBeNull()
  })

  it('rejects zero-width and zero-height regions', () => {
    expect(createPdfRegion({ ...validRegion, right: validRegion.left })).toBeNull()
    expect(createPdfRegion({ ...validRegion, top: validRegion.bottom })).toBeNull()
  })

  it('preserves fractional coordinates without rounding', () => {
    const region = createPdfRegion({
      pageNumber: 2,
      left: 10.125,
      top: 80.875,
      right: 60.625,
      bottom: 20.375
    })

    expect(region).toEqual({
      pageNumber: 2,
      left: 10.125,
      top: 80.875,
      right: 60.625,
      bottom: 20.375
    })
  })

  it('returns an immutable value object', () => {
    const region = createPdfRegion(validRegion)

    expect(Object.isFrozen(region)).toBe(true)
    expect(() => {
      region.left = 25
    }).toThrow(TypeError)
    expect(region.left).toBe(10)
  })

  it('derives another region without mutating the original', () => {
    const original = createPdfRegion(validRegion)
    const derived = createPdfRegion({ ...original, left: 15 })

    expect(original).toEqual(validRegion)
    expect(derived).toEqual({ ...validRegion, left: 15 })
    expect(derived).not.toBe(original)
  })
})
