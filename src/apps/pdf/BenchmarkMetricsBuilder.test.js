import { describe, expect, it } from 'vitest'
import { BenchmarkMetricsBuilder } from './BenchmarkMetricsBuilder.js'

describe('BenchmarkMetricsBuilder', () => {
  it.each([
    { status: 'completed', expected: { latencyMs: 25, success: true, completed: true } },
    { status: 'failed', expected: { latencyMs: 25, success: false, completed: false } }
  ])('builds metrics for $status results', ({ status, expected }) => {
    const metrics = new BenchmarkMetricsBuilder().build({ status, durationMs: 25 })

    expect(metrics).toEqual(expected)
    expect(Object.isFrozen(metrics)).toBe(true)
  })
})
