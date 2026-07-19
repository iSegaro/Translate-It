import { describe, expect, it } from 'vitest'
import { createBenchmarkSummary } from './BenchmarkSummary.js'

describe('BenchmarkSummary', () => {
  it('clones and freezes derived summary data without freezing caller values', () => {
    const latency = { fastestMs: 10 }
    const confidence = { highest: 90 }
    const output = { identical: false }
    const summary = createBenchmarkSummary({
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
