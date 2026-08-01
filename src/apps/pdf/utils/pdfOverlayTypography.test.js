import { describe, expect, it } from 'vitest'
import {
  OVERLAY_BACKGROUND,
  DEFAULT_ASCENT,
  resolveFontFamily,
  resolveAscent,
  resolveDescent,
  computeLineHeight,
  detectTextDirection,
  buildOverlayBaseStyle,
  buildOverlayPositionStyle
} from './pdfOverlayTypography.js'

describe('pdfOverlayTypography', () => {
  it('exports correct constants', () => {
    expect(OVERLAY_BACKGROUND).toBe('rgb(255, 255, 255)')
    expect(DEFAULT_ASCENT).toBe(0.8)
  })

  it('resolveFontFamily returns fallback for null', () => {
    expect(resolveFontFamily(null)).toBe('sans-serif')
  })

  it('resolveFontFamily returns fallback for undefined', () => {
    expect(resolveFontFamily(undefined)).toBe('sans-serif')
  })

  it('resolveAscent returns default for null', () => {
    expect(resolveAscent(null)).toBe(DEFAULT_ASCENT)
  })

  it('resolveAscent returns provided value when finite', () => {
    expect(resolveAscent(0.75)).toBe(0.75)
  })

  it('resolveAscent returns default for NaN', () => {
    expect(resolveAscent(NaN)).toBe(DEFAULT_ASCENT)
  })

  it('resolveDescent returns default for null', () => {
    expect(resolveDescent(null)).toBe(0.2)
  })

  it('resolveDescent returns absolute value of negative descent', () => {
    expect(resolveDescent(-0.25)).toBe(0.25)
  })

  it('computeLineHeight sums resolved ascent and descent', () => {
    expect(computeLineHeight(null, null)).toBeCloseTo(1.0)
    expect(computeLineHeight(0.75, -0.25)).toBeCloseTo(1.0)
  })

  it('detectTextDirection returns ltr for English text', () => {
    expect(detectTextDirection('Hello World')).toBe('ltr')
  })

  it('detectTextDirection returns rtl for Arabic text', () => {
    expect(detectTextDirection('مرحبا بالعالم')).toBe('rtl')
  })

  it('detectTextDirection returns ltr for empty text', () => {
    expect(detectTextDirection('')).toBe('ltr')
  })

  it('detectTextDirection returns ltr for null text', () => {
    expect(detectTextDirection(null)).toBe('ltr')
  })

  it('buildOverlayBaseStyle returns common style fields', () => {
    const style = buildOverlayBaseStyle()
    expect(style.overflow).toBe('hidden')
    expect(style.boxSizing).toBe('border-box')
    expect(style.background).toBe(OVERLAY_BACKGROUND)
    expect(style.pointerEvents).toBe('auto')
    expect(style.userSelect).toBe('text')
    expect(style.willChange).toBe('transform')
  })

  it('buildOverlayPositionStyle returns empty for null bbox', () => {
    expect(buildOverlayPositionStyle(null, 1)).toEqual({})
  })

  it('buildOverlayPositionStyle returns correct position values', () => {
    const bbox = { x: 40, y: 200, width: 300, height: 14 }
    const style = buildOverlayPositionStyle(bbox, 1.5)

    expect(style.position).toBe('absolute')
    expect(style.left).toBe('60px')
    expect(style.top).toBe('300px')
    expect(style.width).toBe('450px')
    expect(style.height).toBe('21px')
  })
})
