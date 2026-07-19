import { describe, expect, it } from 'vitest'
import { RegionComparisonResultAssembler } from './RegionComparisonResultAssembler.js'

describe('RegionComparisonResultAssembler', () => {
  it('builds an immutable result without transforming candidate output', () => {
    const output = Object.freeze({ text: 'recognized text', confidence: 98 })
    const candidate = Object.freeze({
      candidateId: 'scale-1',
      configuration: Object.freeze({ scale: 1, language: 'eng' })
    })
    const result = new RegionComparisonResultAssembler().assemble({
      candidate,
      startedAt: 100,
      completedAt: 125,
      output
    })

    expect(result).toEqual({
      candidateId: 'scale-1',
      configuration: { scale: 1, language: 'eng' },
      runtime: { startedAt: 100, completedAt: 125, latencyMs: 25 },
      output
    })
    expect(result.output).toBe(output)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.runtime)).toBe(true)
  })
})
