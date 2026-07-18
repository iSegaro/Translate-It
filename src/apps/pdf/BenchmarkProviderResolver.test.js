import { describe, expect, it } from 'vitest'
import { BenchmarkProviderResolver } from './BenchmarkProviderResolver.js'

describe('BenchmarkProviderResolver', () => {
  it('returns providers in registry order', () => {
    const providers = [{ id: 'first' }, { id: 'second' }]
    const resolver = new BenchmarkProviderResolver({ providerRegistry: { getAll: () => providers } })

    expect(resolver.resolve()).toEqual(providers)
  })

  it('returns an empty array for an empty registry', () => {
    const resolver = new BenchmarkProviderResolver({ providerRegistry: { getAll: () => [] } })

    expect(resolver.resolve()).toEqual([])
  })

  it('returns an immutable array', () => {
    const resolver = new BenchmarkProviderResolver({ providerRegistry: { getAll: () => [{ id: 'provider' }] } })
    const providers = resolver.resolve()

    expect(Object.isFrozen(providers)).toBe(true)
    expect(() => providers.push({ id: 'another-provider' })).toThrow()
  })
})
