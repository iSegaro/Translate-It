import { describe, expect, it } from 'vitest'
import { CURRENT_PAGE_SOURCE, resolveCurrentPage, resolvePrimaryVisiblePage } from './pdfCurrentPageResolver.js'

describe('pdfCurrentPageResolver', () => {
  const pageGeometries = [
    { pageNumber: 1, top: 0, bottom: 200 },
    { pageNumber: 2, top: 240, bottom: 440 },
    { pageNumber: 3, top: 480, bottom: 680 }
  ]

  it('declares geometry as current page source', () => {
    expect(CURRENT_PAGE_SOURCE).toBe('geometry')
  })

  it('returns null for empty geometry input', () => {
    expect(resolveCurrentPage(0, [])).toBeNull()
    expect(resolveCurrentPage(0, null)).toBeNull()
  })

  it('resolves page containing scrollTop', () => {
    expect(resolveCurrentPage(0, pageGeometries)).toBe(1)
    expect(resolveCurrentPage(199, pageGeometries)).toBe(1)
    expect(resolveCurrentPage(240, pageGeometries)).toBe(2)
    expect(resolveCurrentPage(679, pageGeometries)).toBe(3)
  })

  it('uses exclusive bottom edge', () => {
    expect(resolveCurrentPage(200, pageGeometries)).toBe(1)
    expect(resolveCurrentPage(440, pageGeometries)).toBe(2)
  })

  it('falls back to nearest page when scrollTop is in a gap', () => {
    expect(resolveCurrentPage(210, pageGeometries)).toBe(1)
    expect(resolveCurrentPage(230, pageGeometries)).toBe(2)
  })

  it('falls back to nearest page outside document bounds', () => {
    expect(resolveCurrentPage(-50, pageGeometries)).toBe(1)
    expect(resolveCurrentPage(800, pageGeometries)).toBe(3)
  })

  it('skips invalid geometries', () => {
    expect(resolveCurrentPage(20, [
      { pageNumber: 0, top: 0, bottom: 100 },
      { pageNumber: 2, top: 0, bottom: 100 },
      { pageNumber: 3, top: Number.NaN, bottom: 200 }
    ])).toBe(2)
  })

  it('preserves legacy primary visible page policy from geometry', () => {
    expect(resolvePrimaryVisiblePage(0, [
      { pageNumber: 1, top: -60, bottom: 40, viewportHeight: 500 },
      { pageNumber: 2, top: 20, bottom: 120, viewportHeight: 500 }
    ])).toBe(2)
  })
})
