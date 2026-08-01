import { describe, expect, it } from 'vitest'
import { resolveSelectionIconPosition } from './PdfSelectionPositionResolver.js'

function mockViewport({ width = 1024, height = 768 } = {}) {
  const restoreTargets = []

  const define = (target, property, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, property)
    restoreTargets.push({ target, property, descriptor })
    Object.defineProperty(target, property, {
      configurable: true,
      value
    })
  }

  define(window, 'innerWidth', width)
  define(window, 'innerHeight', height)
  define(document.documentElement, 'clientWidth', width)

  return () => {
    for (const { target, property, descriptor } of restoreTargets.reverse()) {
      if (descriptor) {
        Object.defineProperty(target, property, descriptor)
      } else {
        delete target[property]
      }
    }
  }
}

describe('PdfSelectionPositionResolver', () => {
  it('copies selection geometry when no interaction anchor exists', () => {
    const position = resolveSelectionIconPosition({ x: 120, y: 140, width: 80, height: 18 })

    expect(position).toEqual({
      x: 120,
      y: 140,
      width: 80,
      height: 18
    })
  })

  it('uses interaction anchor with vertical gap while preserving selection dimensions', () => {
    const restoreViewport = mockViewport({ width: 1000, height: 800 })

    try {
      const position = resolveSelectionIconPosition(
        { x: 120, y: 140, width: 80, height: 18 },
        { x: 260, y: 310 }
      )

      expect(position).toEqual({
        x: 260,
        y: 322,
        width: 80,
        height: 18
      })
    } finally {
      restoreViewport()
    }
  })

  it('flips interaction anchor above pointer near viewport bottom', () => {
    const restoreViewport = mockViewport({ width: 1000, height: 340 })

    try {
      const position = resolveSelectionIconPosition(
        { x: 120, y: 140, width: 80, height: 18 },
        { x: 260, y: 310 }
      )

      expect(position).toEqual({
        x: 260,
        y: 274,
        width: 80,
        height: 18
      })
    } finally {
      restoreViewport()
    }
  })

  it('clamps interaction anchor horizontally', () => {
    const restoreViewport = mockViewport({ width: 320, height: 800 })

    try {
      const position = resolveSelectionIconPosition(
        { x: 120, y: 140, width: 80, height: 18 },
        { x: 318, y: 200 }
      )

      expect(position).toEqual({
        x: 288,
        y: 212,
        width: 80,
        height: 18
      })
    } finally {
      restoreViewport()
    }
  })
})
