import { describe, expect, it } from 'vitest'
import { resolvePdfFontFamily } from './pdfFontMap.js'

describe('pdfFontMap', () => {
  it('resolves known PDF font names to CSS font stacks', () => {
    expect(resolvePdfFontFamily('Times-Roman')).toBe('"Times New Roman", Times, serif')
    expect(resolvePdfFontFamily('Helvetica')).toContain('Helvetica')
    expect(resolvePdfFontFamily('Courier')).toContain('Courier')
    expect(resolvePdfFontFamily('Arial')).toContain('Arial')
  })

  it('returns generic fallback for unknown fonts', () => {
    const result = resolvePdfFontFamily('UnknownFont')
    expect(result).toContain('UnknownFont')
    expect(result).toContain('sans-serif')
  })

  it('returns generic fallback for null/undefined', () => {
    expect(resolvePdfFontFamily(null)).toBe('sans-serif')
    expect(resolvePdfFontFamily(undefined)).toBe('sans-serif')
    expect(resolvePdfFontFamily('')).toBe('sans-serif')
  })

  it('does case-insensitive partial matching', () => {
    const result = resolvePdfFontFamily('times new roman bold')
    expect(result).toContain('Times New Roman')
  })
})
