import { describe, expect, it, vi } from 'vitest'
import {
  apiKeyFingerprint,
  createDiscoveryRequestSignal,
  getCachedEntry,
} from './modelDiscoveryUtils.js'
import { clearOpenAIModelCache, fetchOpenAIModels, getCachedOpenAIModels } from './OpenAIModelDiscovery.js'
import { clearDeepSeekModelCache, fetchDeepSeekModels, getCachedDeepSeekModels } from './DeepSeekModelDiscovery.js'

describe('model discovery utilities', () => {
  it('fingerprints complete credentials and uses one anonymous identity', () => {
    expect(apiKeyFingerprint('')).toBe('anonymous')
    expect(apiKeyFingerprint(null)).toBe('anonymous')
    expect(apiKeyFingerprint('full credential')).not.toBe('anonymous')
    expect(apiKeyFingerprint('key-one\nkey-two')).not.toBe(apiKeyFingerprint('key-one\n\nkey-two'))
  })

  it('keeps empty cache values distinct from missing and expires exactly at the TTL', () => {
    const map = new Map([
      ['empty', { models: [], fetchedAt: 1000 }],
      ['stale', { models: ['old'], fetchedAt: 1000 }],
    ])
    const clone = models => [...models]
    expect(getCachedEntry(map, 'empty', clone, 1000)).toEqual([])
    expect(getCachedEntry(map, 'missing', clone, 1000)).toBeNull()
    expect(getCachedEntry(map, 'stale', clone, 1000 + 5 * 60 * 1000)).toBeNull()
    expect(map.has('stale')).toBe(false)
  })

  it('clones using provider semantics and cleans up abort listeners and deadlines', () => {
    vi.useFakeTimers()
    const map = new Map([['key', { models: [{ pricing: { prompt: 1 } }], fetchedAt: 0 }]])
    const clone = models => models.map(model => ({ ...model, pricing: { ...model.pricing } }))
    const result = getCachedEntry(map, 'key', clone, 1)
    result[0].pricing.prompt = 2
    expect(map.get('key').models[0].pricing.prompt).toBe(1)

    const outer = new AbortController()
    const removeListener = vi.spyOn(outer.signal, 'removeEventListener')
    const request = createDiscoveryRequestSignal(outer.signal, 100)
    request.cleanup()
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
    vi.advanceTimersByTime(100)
    expect(request.signal.aborted).toBe(false)
    vi.useRealTimers()
  })

  it('isolates concurrent requests and preserves outer abort reasons', () => {
    vi.useFakeTimers()
    const firstOuter = new AbortController()
    const secondOuter = new AbortController()
    const first = createDiscoveryRequestSignal(firstOuter.signal, 100)
    const second = createDiscoveryRequestSignal(secondOuter.signal, 200)
    const reason = new DOMException('Cancelled by caller', 'AbortError')

    firstOuter.abort(reason)
    expect(first.signal.reason).toBe(reason)
    expect(second.signal.aborted).toBe(false)
    first.cleanup()
    vi.advanceTimersByTime(100)
    expect(first.signal.reason).toBe(reason)
    expect(second.signal.aborted).toBe(false)

    vi.advanceTimersByTime(100)
    expect(second.signal.reason).toMatchObject({ name: 'TimeoutError', message: 'Timed out' })
    second.cleanup()
    vi.useRealTimers()
  })

  it('propagates a shared and pre-existing outer abort reason', () => {
    const reason = new DOMException('Already cancelled', 'AbortError')
    const preAbortedOuter = new AbortController()
    preAbortedOuter.abort(reason)
    const preAborted = createDiscoveryRequestSignal(preAbortedOuter.signal, 1000)
    expect(preAborted.signal.reason).toBe(reason)
    preAborted.cleanup()

    const sharedOuter = new AbortController()
    const first = createDiscoveryRequestSignal(sharedOuter.signal, 1000)
    const second = createDiscoveryRequestSignal(sharedOuter.signal, 1000)
    sharedOuter.abort(reason)
    expect(first.signal.reason).toBe(reason)
    expect(second.signal.reason).toBe(reason)
    first.cleanup()
    second.cleanup()
  })

  it('keeps provider caches independent', async () => {
    clearOpenAIModelCache()
    clearDeepSeekModelCache()
    const response = id => ({ ok: true, json: async () => ({ data: [{ id }] }) })
    await fetchOpenAIModels({ apiKey: 'same-key', fetchFn: vi.fn().mockResolvedValue(response('openai/model')) })
    await fetchDeepSeekModels({ apiKey: 'same-key', fetchFn: vi.fn().mockResolvedValue(response('deepseek/model')) })

    expect(getCachedOpenAIModels('same-key').map(model => model.value)).toEqual(['openai/model'])
    expect(getCachedDeepSeekModels('same-key').map(model => model.value)).toEqual(['deepseek/model'])
    clearOpenAIModelCache()
    expect(getCachedOpenAIModels('same-key')).toBeNull()
    expect(getCachedDeepSeekModels('same-key').map(model => model.value)).toEqual(['deepseek/model'])
    clearDeepSeekModelCache()
  })
})
