import { describe, expect, it } from 'vitest'
import { BenchmarkScoringEngine } from './BenchmarkScoringEngine.js'

describe('BenchmarkScoringEngine', () => {
  it('returns an immutable report in result order', () => {
    const results = Object.freeze([
      Object.freeze({ providerId: 'first', status: 'completed', durationMs: 25 }),
      Object.freeze({ providerId: 'second', status: 'completed', durationMs: 50 })
    ])

    const report = new BenchmarkScoringEngine().score(results)

    expect(report).toEqual({
      providers: [
        {
          providerId: 'first',
          score: null,
          metrics: { latencyMs: 25, success: true, completed: true },
          criteria: {
            latency: { value: 25, weight: null },
            quality: { value: null, weight: null },
            cost: { value: null, weight: null }
          }
        },
        {
          providerId: 'second',
          score: null,
          metrics: { latencyMs: 50, success: true, completed: true },
          criteria: {
            latency: { value: 50, weight: null },
            quality: { value: null, weight: null },
            cost: { value: null, weight: null }
          }
        }
      ],
      winner: null
    })
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.providers)).toBe(true)
    expect(Object.isFrozen(report.providers[0])).toBe(true)
    expect(Object.isFrozen(report.providers[0].metrics)).toBe(true)
    expect(Object.isFrozen(report.providers[0].criteria)).toBe(true)
  })

  it('returns an empty report for empty results', () => {
    expect(new BenchmarkScoringEngine().score([])).toEqual({ providers: [], winner: null })
  })
})
