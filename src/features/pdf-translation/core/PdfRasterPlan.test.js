import { describe, expect, it } from 'vitest'
import { resolvePdfRasterPlan } from './PdfRasterPlan.js'

const DEFAULT_POLICY = Object.freeze({
  maxRasterPixels: 1_000_000,
  maxCanvasDimension: 2_000,
  maxEstimatedBytes: 4_000_000,
  minRasterOutputScale: 0.25
})

function resolvePlan(overrides = {}) {
  return resolvePdfRasterPlan({
    logicalWidth: 1_000,
    logicalHeight: 500,
    ...DEFAULT_POLICY,
    ...overrides
  })
}

describe('resolvePdfRasterPlan', () => {
  it('keeps a viewport at full raster density within budget', () => {
    const plan = resolvePlan()

    expect(plan).toMatchObject({
      rasterOutputScale: 1,
      backingWidth: 1_000,
      backingHeight: 500,
      rasterPixels: 500_000,
      estimatedBytes: 2_000_000,
      degraded: false,
      renderable: true
    })
  })

  it('reduces density for the raster-pixel budget', () => {
    const plan = resolvePlan({ maxRasterPixels: 125_000 })

    expect(plan.rasterOutputScale).toBe(0.5)
    expect(plan.backingWidth).toBe(500)
    expect(plan.backingHeight).toBe(250)
    expect(plan.rasterPixels).toBe(125_000)
    expect(plan.degraded).toBe(true)
  })

  it('reduces density for the canvas-dimension budget', () => {
    const plan = resolvePlan({ maxCanvasDimension: 400 })

    expect(plan.rasterOutputScale).toBe(0.4)
    expect(plan.backingWidth).toBe(400)
    expect(plan.backingHeight).toBe(200)
  })

  it('reduces density for the estimated-byte budget', () => {
    const plan = resolvePlan({ maxEstimatedBytes: 500_000 })

    expect(plan.rasterOutputScale).toBe(0.5)
    expect(plan.estimatedBytes).toBe(500_000)
  })

  it('uses the strictest combined constraint', () => {
    const plan = resolvePlan({
      maxRasterPixels: 45_000,
      maxCanvasDimension: 800,
      maxEstimatedBytes: 400_000
    })

    expect(plan.rasterOutputScale).toBe(0.3)
    expect(plan.rasterPixels).toBe(45_000)
    expect(plan.estimatedBytes).toBe(180_000)
  })

  it('remains within budgets after backing-dimension rounding', () => {
    const plan = resolvePlan({
      logicalWidth: 1_001,
      logicalHeight: 1_001,
      maxRasterPixels: 250_000,
      maxCanvasDimension: 500,
      maxEstimatedBytes: 1_000_000
    })

    expect(plan.backingWidth).toBeLessThanOrEqual(500)
    expect(plan.backingHeight).toBeLessThanOrEqual(500)
    expect(plan.rasterPixels).toBeLessThanOrEqual(250_000)
    expect(plan.estimatedBytes).toBeLessThanOrEqual(1_000_000)
  })

  it('returns authoritative transform ratios after backing-dimension rounding', () => {
    const plan = resolvePlan({ logicalWidth: 1_000, logicalHeight: 333, maxCanvasDimension: 500 })

    expect(plan.rasterOutputScale).toBe(0.5)
    expect(plan.backingWidth).toBe(500)
    expect(plan.backingHeight).toBe(166)
    expect(plan.rasterScaleX).toBe(plan.backingWidth / plan.logicalWidth)
    expect(plan.rasterScaleY).toBe(plan.backingHeight / plan.logicalHeight)
    expect(plan.rasterScaleX).toBeLessThanOrEqual(plan.rasterOutputScale)
    expect(plan.rasterScaleY).toBeLessThanOrEqual(plan.rasterOutputScale)
    expect(plan.backingWidth / plan.backingHeight).toBeCloseTo(1_000 / 333, 2)
    expect(plan.rasterPixels).toBeLessThanOrEqual(1_000_000)
    expect(plan.estimatedBytes).toBeLessThanOrEqual(4_000_000)
  })

  it('marks plans below the minimum raster density as unrenderable', () => {
    const plan = resolvePlan({ maxRasterPixels: 10_000, minRasterOutputScale: 0.25 })

    expect(plan.rasterOutputScale).toBe(0.1)
    expect(plan.renderable).toBe(false)
    expect(plan.degraded).toBe(true)
  })

  it.each([
    [{ logicalWidth: 0 }],
    [{ logicalHeight: Number.NaN }],
    [{ maxRasterPixels: 0 }],
    [{ maxCanvasDimension: 1.5 }],
    [{ maxEstimatedBytes: -1 }],
    [{ minRasterOutputScale: 0 }],
    [{ minRasterOutputScale: 1.1 }]
  ])('rejects invalid input %o', (overrides) => {
    expect(() => resolvePlan(overrides)).toThrow(TypeError)
  })

  it('returns an immutable plan', () => {
    const plan = resolvePlan()

    expect(Object.isFrozen(plan)).toBe(true)
  })
})
