import { describe, expect, it } from 'vitest'
import {
  TEXT_VERTICAL_PAINT_BLEED,
  buildVerticalPaintBleedBoxShadow
} from './pdfOverlayPaintGeometry.js'

describe('pdfOverlayPaintGeometry', () => {
  it('exports the conservative vertical bleed constant', () => {
    expect(TEXT_VERTICAL_PAINT_BLEED).toBe(4)
  })

  it('buildVerticalPaintBleedBoxShadow returns a top/bottom-only shadow', () => {
    const shadow = buildVerticalPaintBleedBoxShadow('rgb(255, 255, 255)')

    expect(shadow).toContain('rgb(255, 255, 255)')
    expect(shadow).toContain('0 4px 0 0')
    expect(shadow).toContain('0 -4px 0 0')
  })

  it('buildVerticalPaintBleedBoxShadow returns none for invalid input', () => {
    expect(buildVerticalPaintBleedBoxShadow(null)).toBe('none')
    expect(buildVerticalPaintBleedBoxShadow('rgb(0, 0, 0)', 0)).toBe('none')
  })
})
