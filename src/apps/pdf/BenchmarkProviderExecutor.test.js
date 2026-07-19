import { describe, expect, it, vi } from 'vitest'
import { BenchmarkProviderExecutor } from './BenchmarkProviderExecutor.js'

describe('BenchmarkProviderExecutor', () => {
  it('executes one provider and returns an immutable completed result', async () => {
    const request = Object.freeze({ region: Object.freeze({ id: 'region' }) })
    const provider = Object.freeze({ id: 'provider' })
    const step = Object.freeze({ providerId: 'provider', state: 'pending' })
    const executeProvider = vi.fn(() => 'translated text')

    const result = await new BenchmarkProviderExecutor({ executeProvider }).execute({ request, provider, step })

    expect(executeProvider).toHaveBeenCalledWith({ request, provider, step })
    expect(result).toEqual({ providerId: 'provider', status: 'completed', output: 'translated text' })
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('propagates callback errors', async () => {
    const error = new Error('provider failed')
    const executor = new BenchmarkProviderExecutor({ executeProvider: () => { throw error } })

    await expect(executor.execute({
      request: Object.freeze({}),
      provider: Object.freeze({ id: 'provider' }),
      step: Object.freeze({ providerId: 'provider', state: 'pending' })
    })).rejects.toBe(error)
  })
})
