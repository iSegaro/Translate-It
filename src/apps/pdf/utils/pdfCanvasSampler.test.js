import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { sampleCanvasBackgroundColor, clearColorCache } from './pdfCanvasSampler.js'

function createMockCanvas(pixelData) {
  return {
    width: 800,
    height: 600,
    getContext: vi.fn(() => ({
      getImageData: vi.fn(() => ({
        data: pixelData || [240, 240, 240, 255]
      }))
    }))
  }
}

function createUniformMockCanvas(r, g, b) {
  return {
    width: 200,
    height: 200,
    getContext: vi.fn(() => ({
      getImageData: vi.fn(() => ({ data: [r, g, b, 255] }))
    }))
  }
}

describe('pdfCanvasSampler', () => {
  beforeEach(() => {
    clearColorCache()
  })

  afterEach(() => {
    clearColorCache()
  })

  it('samples a light gray background and returns rgb', () => {
    const canvas = createMockCanvas([240, 240, 240, 255])
    const bbox = { x: 10, y: 20, width: 100, height: 30 }
    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-1')
    expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })

  it('returns white fallback when canvas is null', () => {
    const color = sampleCanvasBackgroundColor(null, { x: 0, y: 0, width: 10, height: 10 }, 1, 'block-null')
    expect(color).toBe('rgb(255, 255, 255)')
  })

  it('returns white fallback when canvas is undefined', () => {
    const color = sampleCanvasBackgroundColor(undefined, { x: 0, y: 0, width: 10, height: 10 }, 1, 'block-undef')
    expect(color).toBe('rgb(255, 255, 255)')
  })

  it('returns white fallback when boundingBox is null', () => {
    const canvas = createMockCanvas()
    const color = sampleCanvasBackgroundColor(canvas, null, 1, 'block-nobbox')
    expect(color).toBe('rgb(255, 255, 255)')
  })

  it('returns white fallback when canvas context is unavailable', () => {
    const canvas = {
      width: 800,
      height: 600,
      getContext: vi.fn(() => null)
    }
    const color = sampleCanvasBackgroundColor(canvas, { x: 0, y: 0, width: 10, height: 10 }, 1, 'block-noctx')
    expect(color).toBe('rgb(255, 255, 255)')
  })

  it('returns white fallback when canvas dimensions are zero', () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({}))
    }
    const color = sampleCanvasBackgroundColor(canvas, { x: 0, y: 0, width: 10, height: 10 }, 1, 'block-zerodim')
    expect(color).toBe('rgb(255, 255, 255)')
  })

  it('returns white fallback when boundingBox has zero dimensions', () => {
    const canvas = createMockCanvas()
    const color = sampleCanvasBackgroundColor(canvas, { x: 0, y: 0, width: 0, height: 0 }, 1, 'block-zerobbox')
    expect(color).toBe('rgb(255, 255, 255)')
  })

  it('clamps out-of-bounds sample points to canvas edges', () => {
    const getImageData = vi.fn(() => ({ data: [200, 200, 200, 255] }))
    const canvas = {
      width: 100,
      height: 100,
      getContext: vi.fn(() => ({ getImageData }))
    }
    const bbox = { x: -50, y: -50, width: 200, height: 200 }

    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-oob')
    expect(getImageData).toHaveBeenCalled()
    expect(color).toBe('rgb(200, 200, 200)')
  })

  it('returns sampled color for a uniform light background', () => {
    const canvas = createUniformMockCanvas(220, 220, 220)
    const bbox = { x: 10, y: 10, width: 100, height: 100 }
    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-uniform')
    expect(color).toBe('rgb(220, 220, 220)')
  })

  it('returns sampled color for a beige/tan background', () => {
    const canvas = createUniformMockCanvas(245, 235, 210)
    const bbox = { x: 10, y: 20, width: 100, height: 30 }
    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-beige')
    expect(color).toBe('rgb(245, 235, 210)')
  })

  it('returns sampled color for a pure white background', () => {
    const canvas = createUniformMockCanvas(255, 255, 255)
    const bbox = { x: 10, y: 10, width: 100, height: 100 }
    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-white')
    expect(color).toBe('rgb(255, 255, 255)')
  })

  it('excludes dark text pixels when neighbors are light', () => {
    let callCount = 0
    const canvas = {
      width: 200,
      height: 200,
      getContext: vi.fn(() => ({
        getImageData: vi.fn(() => {
          callCount++
          if (callCount <= 2) {
            return { data: [10, 10, 10, 255] }
          }
          return { data: [220, 220, 220, 255] }
        })
      }))
    }
    const bbox = { x: 10, y: 10, width: 100, height: 100 }
    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-text')
    expect(color).toBe('rgb(220, 220, 220)')
  })

  it('caches results per block id and scale', () => {
    const mockCtx = { getImageData: vi.fn(() => ({ data: [200, 200, 200, 255] })) }
    const canvas = { width: 200, height: 200, getContext: vi.fn(() => mockCtx) }
    const bbox = { x: 10, y: 20, width: 100, height: 30 }

    sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-cache')
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(14)

    sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-cache')
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(14)
  })

  it('resamples when scale changes', () => {
    const mockCtx = { getImageData: vi.fn(() => ({ data: [200, 200, 200, 255] })) }
    const canvas = { width: 200, height: 200, getContext: vi.fn(() => mockCtx) }
    const bbox = { x: 10, y: 20, width: 100, height: 30 }

    sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-scale')
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(14)

    sampleCanvasBackgroundColor(canvas, bbox, 2, 'block-scale')
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(28)
  })

  it('clears cache for a specific block id', () => {
    const mockCtx = { getImageData: vi.fn(() => ({ data: [200, 200, 200, 255] })) }
    const canvas = { width: 200, height: 200, getContext: vi.fn(() => mockCtx) }
    const bbox = { x: 10, y: 20, width: 100, height: 30 }

    sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-clear')
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(14)

    sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-clear')
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(14)

    clearColorCache('block-clear')
    sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-clear')
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(28)
  })

  it('clears all caches when no block id is provided', () => {
    const mockCtx = { getImageData: vi.fn(() => ({ data: [200, 200, 200, 255] })) }
    const canvas = { width: 200, height: 200, getContext: vi.fn(() => mockCtx) }
    const bbox = { x: 10, y: 20, width: 100, height: 30 }

    sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-a')
    sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-b')
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(28)

    clearColorCache()

    sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-a')
    sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-b')
    expect(mockCtx.getImageData).toHaveBeenCalledTimes(56)
  })

  it('handles canvas getContext throwing an error gracefully', () => {
    const canvas = {
      width: 100,
      height: 100,
      getContext: vi.fn(() => {
        throw new Error('SecurityError')
      })
    }
    expect(() => {
      sampleCanvasBackgroundColor(canvas, { x: 0, y: 0, width: 10, height: 10 }, 1, 'block-throw')
    }).not.toThrow()
    const color = sampleCanvasBackgroundColor(canvas, { x: 0, y: 0, width: 10, height: 10 }, 1, 'block-throw')
    expect(color).toBe('rgb(255, 255, 255)')
  })

  it('handles getImageData throwing an error gracefully', () => {
    const canvas = {
      width: 100,
      height: 100,
      getContext: vi.fn(() => ({
        getImageData: vi.fn(() => {
          throw new Error('SecurityError')
        })
      }))
    }
    const color = sampleCanvasBackgroundColor(canvas, { x: 0, y: 0, width: 10, height: 10 }, 1, 'block-imgerr')
    expect(color).toBe('rgb(255, 255, 255)')
  })

  it('averages multiple light samples', () => {
    let callCount = 0
    const canvas = {
      width: 200,
      height: 200,
      getContext: vi.fn(() => ({
        getImageData: vi.fn(() => {
          callCount++
          if (callCount <= 2) return { data: [10, 10, 10, 255] }
          const variation = callCount % 3
          if (variation === 0) return { data: [200, 200, 200, 255] }
          if (variation === 1) return { data: [210, 210, 210, 255] }
          return { data: [190, 190, 190, 255] }
        })
      }))
    }
    const bbox = { x: 10, y: 10, width: 100, height: 100 }
    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-avg')
    const expected = Math.round((200 + 210 + 190) / 3)
    expect(color).toBe(`rgb(${expected}, ${expected}, ${expected})`)
  })

  it('returns white fallback when all samples are dark', () => {
    const canvas = createUniformMockCanvas(20, 20, 20)
    const bbox = { x: 10, y: 10, width: 100, height: 100 }
    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-alldark')
    expect(color).toBe('rgb(255, 255, 255)')
  })

  it('lightens sampled color when luminance is below minimum', () => {
    const canvas = createUniformMockCanvas(140, 140, 140)
    const bbox = { x: 10, y: 10, width: 100, height: 100 }
    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-dim')
    const match = color.match(/rgb\((\d+), (\d+), (\d+)\)/)
    expect(match).not.toBeNull()
    const luminance = 0.299 * Number(match[1]) + 0.587 * Number(match[2]) + 0.114 * Number(match[3])
    expect(luminance).toBeGreaterThanOrEqual(200)
  })

  it('preserves light backgrounds without modification', () => {
    const canvas = createUniformMockCanvas(240, 240, 240)
    const bbox = { x: 10, y: 10, width: 100, height: 100 }
    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-lightok')
    expect(color).toBe('rgb(240, 240, 240)')
  })

  it('mixed dark text and light background still returns readable light color', () => {
    let callCount = 0
    const canvas = {
      width: 200,
      height: 200,
      getContext: vi.fn(() => ({
        getImageData: vi.fn(() => {
          callCount++
          if (callCount <= 4) return { data: [30, 30, 30, 255] }
          return { data: [230, 230, 230, 255] }
        })
      }))
    }
    const bbox = { x: 10, y: 10, width: 100, height: 100 }
    const color = sampleCanvasBackgroundColor(canvas, bbox, 1, 'block-mixed')
    expect(color).not.toBe('rgb(255, 255, 255)')
    const match = color.match(/rgb\((\d+), (\d+), (\d+)\)/)
    expect(match).not.toBeNull()
    const lum = 0.299 * Number(match[1]) + 0.587 * Number(match[2]) + 0.114 * Number(match[3])
    expect(lum).toBeGreaterThanOrEqual(200)
  })
})
