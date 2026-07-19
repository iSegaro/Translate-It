import { describe, expect, it } from 'vitest'
import { createRegionComparisonSummary } from './RegionComparisonSummary.js'

describe('RegionComparisonSummary', () => {
  it('clones and freezes derived summary data without freezing caller values', () => {
    const latency = { fastestMs: 10 }
    const confidence = { highest: 90 }
    const output = { identical: false }
    const summary = createRegionComparisonSummary({
      winnerCandidateId: null,
      fastestCandidateId: null,
      latency,
      confidence,
      output
    })

    expect(Object.isFrozen(summary)).toBe(true)
    expect(Object.isFrozen(summary.latency)).toBe(true)
    expect(summary.latency).not.toBe(latency)
    expect(Object.isFrozen(latency)).toBe(false)
    expect(Object.isFrozen(confidence)).toBe(false)
    expect(Object.isFrozen(output)).toBe(false)
  })
})
