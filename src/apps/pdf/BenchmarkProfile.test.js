import { describe, expect, it } from 'vitest'
import { createBenchmarkProfile } from './BenchmarkProfile.js'
import { BenchmarkCandidatePlanner } from './BenchmarkCandidatePlanner.js'
import { DEFAULT_REGION_BENCHMARK_PROFILE } from './regionBenchmarkProfile.js'

describe('BenchmarkProfile', () => {
  it('creates immutable ordered benchmark policy', () => {
    const configurations = Object.freeze([
      Object.freeze({ scale: 1.5, language: 'eng' }),
      Object.freeze({ scale: 1, language: 'fra' })
    ])
    const profile = createBenchmarkProfile({ id: 'custom', name: 'Custom', configurations })

    expect(profile).toEqual({ id: 'custom', name: 'Custom', configurations })
    expect(Object.isFrozen(profile)).toBe(true)
    expect(Object.isFrozen(profile.configurations)).toBe(true)
    expect(Object.isFrozen(profile.configurations[0])).toBe(true)
    expect(profile.configurations).not.toBe(configurations)
  })

  it('preserves current default benchmark behavior', () => {
    expect(DEFAULT_REGION_BENCHMARK_PROFILE).toEqual({
      id: 'default-region-ocr',
      name: 'Default Region OCR',
      configurations: [
        { scale: 1, language: 'eng' },
        { scale: 1.5, language: 'eng' }
      ]
    })
    expect(new BenchmarkCandidatePlanner().createCandidates({
      configurations: DEFAULT_REGION_BENCHMARK_PROFILE.configurations
    })).toEqual([
      { candidateId: 'scale-1-eng', configuration: { scale: 1, language: 'eng' } },
      { candidateId: 'scale-1.5-eng', configuration: { scale: 1.5, language: 'eng' } }
    ])
  })
})
