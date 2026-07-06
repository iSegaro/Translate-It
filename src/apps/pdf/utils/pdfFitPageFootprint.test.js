import { describe, expect, it } from 'vitest'
import { getPageChromeHeight, getViewerVerticalChromeHeight, resolvePdfCanvasSlot } from './pdfFitPageFootprint.js'

describe('pdfFitPageFootprint', () => {
  it('keeps the width slot compatible with existing page margin behavior', () => {
    expect(resolvePdfCanvasSlot({ width: 400, height: 600 }).availableCanvasWidth).toBe(352)
  })

  it('subtracts explicit viewer and page chrome from fit-page canvas height', () => {
    const slot = resolvePdfCanvasSlot({ width: 400, height: 600 })

    expect(getViewerVerticalChromeHeight()).toBe(40)
    expect(getPageChromeHeight()).toBe(60)
    expect(slot.availableCanvasHeight).toBe(500)
  })

  it('clamps dimensions for incomplete initial layout requests', () => {
    const slot = resolvePdfCanvasSlot({ width: 0, height: 0 })

    expect(slot.availableCanvasWidth).toBe(320)
    expect(slot.availableCanvasHeight).toBe(0)
  })
})
