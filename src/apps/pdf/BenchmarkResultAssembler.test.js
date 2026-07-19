import { describe, expect, it } from 'vitest'
import { BenchmarkResultAssembler } from './BenchmarkResultAssembler.js'

describe('BenchmarkResultAssembler', () => {
  it('builds an immutable result without transforming provider output', () => {
    const output = Object.freeze({ text: 'recognized text', confidence: 98 })
    const result = new BenchmarkResultAssembler().assemble({
      providerId: 'provider',
      startedAt: 100,
      completedAt: 125,
      output
    })

    expect(result).toEqual({
      providerId: 'provider',
      runtime: { startedAt: 100, completedAt: 125, latencyMs: 25 },
      output
    })
    expect(result.output).toBe(output)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.runtime)).toBe(true)
  })
})
