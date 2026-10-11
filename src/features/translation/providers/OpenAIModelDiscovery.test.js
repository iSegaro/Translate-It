import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearOpenAIModelCache,
  fetchOpenAIModels,
  getCachedOpenAIModels,
  MissingOpenAIKeyError,
  normalizeOpenAIModels,
} from './OpenAIModelDiscovery.js'

vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }))
vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn().mockResolvedValue({}) }))

const response = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })

describe('OpenAI model discovery', () => {
  afterEach(() => {
    clearOpenAIModelCache()
    vi.useRealTimers()
  })

  it('uses a parsed Bearer key and safe model names, falling back to IDs without price metadata', async () => {
    const configuredKey = ' first-key \n\n second-key '
    const fetchFn = vi.fn().mockResolvedValue(response({ data: [
      { id: ' model/one ', name: ' Friendly Model ', owned_by: 'organization', pricing: { prompt: '0.1' } },
      { id: 'model/one', name: 'Duplicate' },
      { id: 'model/two', owned_by: 'provider' },
      { id: 'model/three', name: '  ' },
      { name: 'No ID' },
    ] }))
    await expect(fetchOpenAIModels({ apiKey: configuredKey, fetchFn })).resolves.toEqual([
      { value: 'model/one', name: 'Friendly Model' },
      { value: 'model/two', name: 'model/two' },
      { value: 'model/three', name: 'model/three' },
    ])
    expect(fetchFn).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer first-key' },
      signal: expect.any(AbortSignal),
    }))
    expect(fetchFn.mock.calls[0][1].headers.Authorization).not.toContain('\n')
    expect(JSON.stringify(getCachedOpenAIModels(configuredKey))).not.toContain('first-key')
  })

  it('rejects missing or blank keys before any network request', async () => {
    const fetchFn = vi.fn()
    for (const apiKey of ['', ' \n\t\n ', null]) {
      await expect(fetchOpenAIModels({ apiKey, fetchFn })).rejects.toBeInstanceOf(MissingOpenAIKeyError)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('caches a valid empty list and rejects malformed shapes without caching', async () => {
    const emptyFetch = vi.fn().mockResolvedValue(response({ data: [] }))
    await expect(fetchOpenAIModels({ apiKey: 'empty-key', fetchFn: emptyFetch })).resolves.toEqual([])
    expect(getCachedOpenAIModels('empty-key')).toEqual([])
    for (const payload of [null, {}, { data: 'bad' }, { data: [{ name: 'no id' }] }]) {
      await expect(fetchOpenAIModels({
        apiKey: 'malformed-key',
        fetchFn: vi.fn().mockResolvedValue(response(payload)),
      })).rejects.toThrow('Invalid OpenAI model list response')
    }
    expect(getCachedOpenAIModels('malformed-key')).toBeNull()
    expect(normalizeOpenAIModels({ data: [{ id: '  id/only  ', owned_by: 'not a display name' }] }))
      .toEqual([{ value: 'id/only', name: 'id/only' }])
  })

  it('caches by full configured credential string and expires entries after five minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-01T00:00:00Z'))
    const configuredKey = 'key-one\nkey-two'
    await fetchOpenAIModels({
      apiKey: configuredKey,
      fetchFn: vi.fn().mockResolvedValue(response({ data: [{ id: 'model/id' }] })),
    })
    expect(getCachedOpenAIModels(configuredKey)).toEqual([{ value: 'model/id', name: 'model/id' }])
    expect(getCachedOpenAIModels('key-one\n\nkey-two')).toBeNull()
    expect(getCachedOpenAIModels('other-key')).toBeNull()
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(getCachedOpenAIModels(configuredKey)).toBeNull()
  })

  it('rejects HTTP failures and timeouts', async () => {
    await expect(fetchOpenAIModels({
      apiKey: 'key',
      fetchFn: vi.fn().mockResolvedValue(response({}, false, 401)),
    })).rejects.toThrow('401')
    const waitsForAbort = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    await expect(fetchOpenAIModels({ apiKey: 'key', fetchFn: waitsForAbort, timeoutMs: 5 }))
      .rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('does not cache late transport responses or JSON resolved after abort', async () => {
    let resolveTransport
    const transport = vi.fn(() => new Promise(resolve => { resolveTransport = resolve }))
    const transportAbort = new AbortController()
    const transportPending = fetchOpenAIModels({ apiKey: 'transport-key', fetchFn: transport, signal: transportAbort.signal })
    transportAbort.abort()
    resolveTransport(response({ data: [{ id: 'too-late' }] }))
    await expect(transportPending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedOpenAIModels('transport-key')).toBeNull()

    let resolveJson
    const jsonFetch = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(resolve => { resolveJson = resolve }) })
    const jsonAbort = new AbortController()
    const jsonPending = fetchOpenAIModels({ apiKey: 'json-key', fetchFn: jsonFetch, signal: jsonAbort.signal })
    await vi.waitFor(() => expect(resolveJson).toBeTypeOf('function'))
    jsonAbort.abort()
    resolveJson({ data: [{ id: 'too-late' }] })
    await expect(jsonPending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedOpenAIModels('json-key')).toBeNull()
  })

  it('normalizes the full catalog without a truncation cap', () => {
    const models = normalizeOpenAIModels({ data: Array.from({ length: 700 }, (_, index) => ({ id: `model/${index}` })) })
    expect(models).toHaveLength(700)
    expect(models.at(-1)).toEqual({ value: 'model/699', name: 'model/699' })
  })
})
