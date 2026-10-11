import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearDeepSeekModelCache,
  fetchDeepSeekModels,
  getCachedDeepSeekModels,
  MissingDeepSeekKeyError,
  normalizeDeepSeekModels,
} from './DeepSeekModelDiscovery.js'

vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }))
vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn().mockResolvedValue({}) }))

const response = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })

describe('DeepSeek model discovery', () => {
  afterEach(() => {
    clearDeepSeekModelCache()
    vi.useRealTimers()
  })

  it('uses the first parsed key and normalizes IDs without inventing labels or capability metadata', async () => {
    const configuredKey = ' first-key \n\n second-key '
    const fetchFn = vi.fn().mockResolvedValue(response({ data: [
      { id: ' model/one ', owned_by: 'deepseek', pricing: [{ prompt: '0.1' }] },
      { id: 'model/one', name: 'Duplicate' },
      { id: 'named/model', name: ' Display Name ' },
      { id: 'invalid/name', name: { value: 'not a string' } },
      { name: 'No ID' },
    ] }))
    await expect(fetchDeepSeekModels({ apiKey: configuredKey, fetchFn })).resolves.toEqual([
      { value: 'model/one', name: 'model/one' },
      { value: 'named/model', name: 'Display Name' },
      { value: 'invalid/name', name: 'invalid/name' },
    ])
    expect(fetchFn).toHaveBeenCalledWith('https://api.deepseek.com/models', expect.objectContaining({
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer first-key' },
      signal: expect.any(AbortSignal),
    }))
    expect(fetchFn.mock.calls[0][1].headers.Authorization).not.toContain('\n')
    expect(JSON.stringify(getCachedDeepSeekModels(configuredKey))).not.toContain('first-key')
    expect(normalizeDeepSeekModels({ data: [{ id: 'model/id', owned_by: 'owner' }] }))
      .toEqual([{ value: 'model/id', name: 'model/id' }])
  })

  it('rejects empty or blank keys before making a request', async () => {
    const fetchFn = vi.fn()
    for (const apiKey of ['', ' \n\t\n ', null]) {
      await expect(fetchDeepSeekModels({ apiKey, fetchFn })).rejects.toBeInstanceOf(MissingDeepSeekKeyError)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('caches valid-empty responses and rejects malformed payloads before cache updates', async () => {
    await expect(fetchDeepSeekModels({
      apiKey: 'empty-key',
      fetchFn: vi.fn().mockResolvedValue(response({ data: [] })),
    })).resolves.toEqual([])
    expect(getCachedDeepSeekModels('empty-key')).toEqual([])

    await fetchDeepSeekModels({
      apiKey: 'malformed-key',
      fetchFn: vi.fn().mockResolvedValue(response({ data: [{ id: 'cached/model' }] })),
    })
    for (const payload of [null, {}, { data: 'bad' }, { data: [{ name: 'no ID' }] }]) {
      await expect(fetchDeepSeekModels({
        apiKey: 'malformed-key',
        fetchFn: vi.fn().mockResolvedValue(response(payload)),
      })).rejects.toThrow('Invalid DeepSeek model list response')
      expect(getCachedDeepSeekModels('malformed-key')).toEqual([{ value: 'cached/model', name: 'cached/model' }])
    }
  })

  it('caches by full credential string for five minutes and expires entries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const configuredKey = 'key-one\nkey-two'
    await fetchDeepSeekModels({
      apiKey: configuredKey,
      fetchFn: vi.fn().mockResolvedValue(response({ data: [{ id: 'cached/model' }] })),
    })
    expect(getCachedDeepSeekModels(configuredKey)).toEqual([{ value: 'cached/model', name: 'cached/model' }])
    expect(getCachedDeepSeekModels('key-one\n\nkey-two')).toBeNull()
    expect(getCachedDeepSeekModels('other-key')).toBeNull()
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(getCachedDeepSeekModels(configuredKey)).toBeNull()
  })

  it('rejects HTTP failures and times out', async () => {
    await expect(fetchDeepSeekModels({
      apiKey: 'key',
      fetchFn: vi.fn().mockResolvedValue(response({}, false, 401)),
    })).rejects.toThrow('401')
    const waitsForAbort = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    await expect(fetchDeepSeekModels({ apiKey: 'key', fetchFn: waitsForAbort, timeoutMs: 5 }))
      .rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('never caches late transport or JSON results after abort', async () => {
    let resolveTransport
    const transport = vi.fn(() => new Promise(resolve => { resolveTransport = resolve }))
    const transportAbort = new AbortController()
    const transportPending = fetchDeepSeekModels({ apiKey: 'transport-key', fetchFn: transport, signal: transportAbort.signal })
    transportAbort.abort()
    resolveTransport(response({ data: [{ id: 'late/model' }] }))
    await expect(transportPending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedDeepSeekModels('transport-key')).toBeNull()

    let resolveJson
    const jsonFetch = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(resolve => { resolveJson = resolve }) })
    const jsonAbort = new AbortController()
    const jsonPending = fetchDeepSeekModels({ apiKey: 'json-key', fetchFn: jsonFetch, signal: jsonAbort.signal })
    await vi.waitFor(() => expect(resolveJson).toBeTypeOf('function'))
    jsonAbort.abort()
    resolveJson({ data: [{ id: 'late/model' }] })
    await expect(jsonPending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedDeepSeekModels('json-key')).toBeNull()
  })

  it('normalizes the full catalog without truncation', () => {
    const models = normalizeDeepSeekModels({ data: Array.from({ length: 650 }, (_, index) => ({ id: `model/${index}` })) })
    expect(models).toHaveLength(650)
    expect(models.at(-1)).toEqual({ value: 'model/649', name: 'model/649' })
  })
})
