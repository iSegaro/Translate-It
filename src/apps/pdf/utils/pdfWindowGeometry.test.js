import { describe, expect, it } from 'vitest'
import { buildPdfSelectionIconStyle } from './pdfWindowGeometry.js'

describe('pdfWindowGeometry selection icon style', () => {
  it('uses the provided selection coordinates directly without re-anchoring', () => {
    const style = buildPdfSelectionIconStyle({
      x: 200,
      y: 150,
      width: 80,
      height: 18
    }, {
      width: 1000,
      height: 800
    })

    expect(style).toMatchObject({
      position: 'fixed',
      left: '200px',
      top: '150px',
      width: '32px',
      height: '32px'
    })
  })

  it('keeps the provided icon coordinates intact even near viewport edges', () => {
    const style = buildPdfSelectionIconStyle({
      x: 980,
      y: 770,
      width: 80,
      height: 18
    }, {
      width: 1000,
      height: 800
    })

    expect(style.left).toBe('980px')
    expect(style.top).toBe('770px')
  })
})
