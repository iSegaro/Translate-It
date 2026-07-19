import { describe, expect, it } from 'vitest'
import { BenchmarkScoringEngine } from './BenchmarkScoringEngine.js'

describe('BenchmarkScoringEngine', () => {
  it('returns an immutable report in result order', () => {
    const results = Object.freeze([
      Object.freeze({ providerId: 'first', status: 'completed' }),
      Object.freeze({ providerId: 'second', status: 'completed' })
    ])

    const report = new BenchmarkScoringEngine().score(results)

    expect(report).toEqual({
      providers: [
        { providerId: 'first', score: null },
        { providerId: 'second', score: null }
      ],
      winner: null
    })
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.providers)).toBe(true)
    expect(Object.isFrozen(report.providers[0])).toBe(true)
  })

  it('returns an empty report for empty results', () => {
    expect(new BenchmarkScoringEngine().score([])).toEqual({ providers: [], winner: null })
  })
})
