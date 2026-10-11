import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearOpenRouterModelCache,
  fetchOpenRouterModels,
  getCachedOpenRouterModels,
  normalizeOpenRouterModels,
} from './OpenRouterModelDiscovery.js'

vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }))
vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn().mockResolvedValue({}) }))

const response = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })

describe('OpenRouter model discovery', () => {
  afterEach(() => {
    clearOpenRouterModelCache()
    vi.useRealTimers()
  })

  it('normalizes catalog names, ids and finite string pricing defensively', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response({ data: [
      { id: ' vendor/model ', name: ' Vendor Model ', pricing: { prompt: '0.0000025', completion: 'NaN' } },
      { id: 'vendor/model', name: 'Duplicate' },
      { id: 'free/model', name: '', pricing: { prompt: 'Infinity', completion: '0' } },
      { id: 'missing/model' },
      { name: 'No ID' },
    ] }))
    const models = await fetchOpenRouterModels({ apiKey: 'secret-key', fetchFn })
    expect(models).toEqual([
      { value: 'vendor/model', name: 'Vendor Model', pricing: { prompt: 0.0000025, completion: null } },
      { value: 'free/model', name: 'free/model', pricing: { prompt: null, completion: 0 } },
      { value: 'missing/model', name: 'missing/model', pricing: null },
    ])
    expect(fetchFn).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models', expect.objectContaining({
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer secret-key' },
      signal: expect.any(AbortSignal),
    }))
    expect(JSON.stringify(models)).not.toContain('secret-key')
  })

  it('normalizes invalid inputs to an empty list', () => {
    expect(normalizeOpenRouterModels(null)).toEqual([])
    expect(normalizeOpenRouterModels({ data: 'not-list' })).toEqual([])
    expect(normalizeOpenRouterModels({ data: [] })).toEqual([])
  })

  it.each([null, {}, { data: 'bad' }, { data: [{ name: 'missing id' }] }])(
    'rejects malformed payload %j and does not cache it', async payload => {
      await expect(fetchOpenRouterModels({
        apiKey: 'malformed-key',
        fetchFn: vi.fn().mockResolvedValue(response(payload)),
      })).rejects.toThrow('Invalid OpenRouter model list response')
      expect(getCachedOpenRouterModels('malformed-key')).toBeNull()
    }
  )

  it('does not send Authorization without a configured key and caches valid empty catalogs', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response({ data: [] }))
    await expect(fetchOpenRouterModels({ fetchFn })).resolves.toEqual([])
    expect(fetchFn.mock.calls[0][1].headers).toEqual({ Accept: 'application/json' })
    expect(getCachedOpenRouterModels()).toEqual([])
  })

  it('uses only the first parsed key in Authorization and fingerprints the full configured string', async () => {
    const configuredKey = '  first-key  \n\n second-key \n'
    const fetchFn = vi.fn().mockResolvedValue(response({ data: [{ id: 'catalog/model' }] }))
    await fetchOpenRouterModels({ apiKey: configuredKey, fetchFn })
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer first-key')
    expect(fetchFn.mock.calls[0][1].headers.Authorization).not.toContain('\n')
    expect(getCachedOpenRouterModels(configuredKey)).toHaveLength(1)
    expect(getCachedOpenRouterModels('first-key\n\n second-key')).toBeNull()
  })

  it.each(['', ' \n\t\n '])('omits Authorization when no key parses from %j', async apiKey => {
    const fetchFn = vi.fn().mockResolvedValue(response({ data: [] }))
    await fetchOpenRouterModels({ apiKey, fetchFn })
    expect(fetchFn.mock.calls[0][1].headers).toEqual({ Accept: 'application/json' })
  })

  it('caches per key for five minutes and expires entries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
    await fetchOpenRouterModels({
      apiKey: 'key-one',
      fetchFn: vi.fn().mockResolvedValue(response({ data: [{ id: 'one/model' }] })),
    })
    expect(getCachedOpenRouterModels('key-one')).toEqual([
      { value: 'one/model', name: 'one/model', pricing: null },
    ])
    expect(getCachedOpenRouterModels('key-two')).toBeNull()
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(getCachedOpenRouterModels('key-one')).toBeNull()
  })

  it('rejects HTTP failures, times out, and propagates aborts without exposing keys', async () => {
    await expect(fetchOpenRouterModels({
      apiKey: 'private-key',
      fetchFn: vi.fn().mockResolvedValue(response({}, false, 401)),
    })).rejects.toThrow('401')
    const waitsForAbort = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    await expect(fetchOpenRouterModels({ apiKey: 'private-key', fetchFn: waitsForAbort, timeoutMs: 5 }))
      .rejects.toMatchObject({ name: 'TimeoutError' })

    const controller = new AbortController()
    const aborted = fetchOpenRouterModels({ apiKey: 'private-key', fetchFn: waitsForAbort, signal: controller.signal })
    controller.abort()
    await expect(aborted).rejects.toBeDefined()
    expect(waitsForAbort.mock.calls.every(call => call[0] === 'https://openrouter.ai/api/v1/models')).toBe(true)
  })

  it('does not cache a transport response that resolves after abort', async () => {
    let resolveTransport
    const fetchFn = vi.fn(() => new Promise(resolve => { resolveTransport = resolve }))
    const controller = new AbortController()
    const pending = fetchOpenRouterModels({ apiKey: 'late-transport-key', fetchFn, signal: controller.signal })
    controller.abort()
    resolveTransport(response({ data: [{ id: 'late/model' }] }))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedOpenRouterModels('late-transport-key')).toBeNull()
  })

  it('does not cache JSON that resolves after abort', async () => {
    let resolveJson
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => new Promise(resolve => { resolveJson = resolve }),
    })
    const controller = new AbortController()
    const pending = fetchOpenRouterModels({ apiKey: 'late-json-key', fetchFn, signal: controller.signal })
    await vi.waitFor(() => expect(resolveJson).toBeTypeOf('function'))
    controller.abort()
    resolveJson({ data: [{ id: 'late/model' }] })
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedOpenRouterModels('late-json-key')).toBeNull()
  })

  it('normalizes catalogs past the former limit including late entries', () => {
    const data = { data: Array.from({ length: 600 }, (_, index) => ({ id: `model/${index}` })) }
    const models = normalizeOpenRouterModels(data)
    expect(models).toHaveLength(600)
    expect(models.at(-1).value).toBe('model/599')
  })
})
