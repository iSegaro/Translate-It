import { describe, expect, it } from 'vitest'
import { RegionComparisonCandidatePlanner } from './RegionComparisonCandidatePlanner.js'

describe('RegionComparisonCandidatePlanner', () => {
  it('creates immutable candidates in supplied configuration order', () => {
    const configurations = Object.freeze([
      Object.freeze({ scale: 1.5, language: 'eng' }),
      Object.freeze({ scale: 1, language: 'fra' })
    ])
    const candidates = new RegionComparisonCandidatePlanner().createCandidates({ configurations })

    expect(candidates).toEqual([
      { candidateId: 'scale-1.5-eng', configuration: { scale: 1.5, language: 'eng' } },
      { candidateId: 'scale-1-fra', configuration: { scale: 1, language: 'fra' } }
    ])
    expect(Object.isFrozen(candidates)).toBe(true)
    expect(Object.isFrozen(candidates[0])).toBe(true)
    expect(Object.isFrozen(candidates[0].configuration)).toBe(true)
    expect(candidates[0].configuration).not.toBe(configurations[0])
    expect(configurations).toEqual([
      { scale: 1.5, language: 'eng' },
      { scale: 1, language: 'fra' }
    ])
  })

  it('requires configuration input', () => {
    expect(() => new RegionComparisonCandidatePlanner().createCandidates()).toThrow('RegionComparisonCandidatePlanner requires configurations')
  })
})
