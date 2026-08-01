import { describe, expect, it } from 'vitest'
import { getStructuralPageChromeHeight, getViewerVerticalChromeHeight, resolvePdfCanvasSlot } from './pdfFitPageFootprint.js'

describe('pdfFitPageFootprint', () => {
  it('subtracts structural chrome and pane safety clearance from each width edge', () => {
    expect(resolvePdfCanvasSlot({ width: 400, height: 600 }).availableCanvasWidth).toBe(352)
  })

  it('subtracts explicit viewer and structural page chrome from fit-page canvas height', () => {
    const slot = resolvePdfCanvasSlot({ width: 400, height: 600 })

    expect(getViewerVerticalChromeHeight()).toBe(40)
    expect(getStructuralPageChromeHeight()).toBe(60)
    expect(slot.availableCanvasHeight).toBe(500)
  })

  it('clamps dimensions for incomplete initial layout requests', () => {
    const slot = resolvePdfCanvasSlot({ width: 0, height: 0 })

    expect(slot.availableCanvasWidth).toBe(320)
    expect(slot.availableCanvasHeight).toBe(0)
  })
})
