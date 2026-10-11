import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearRequestyModelCache,
  fetchRequestyModels,
  getCachedRequestyModels,
  normalizeRequestyModels,
} from './RequestyModelDiscovery.js'

vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }))
vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn().mockResolvedValue({}) }))

const response = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })

describe('Requesty model discovery', () => {
  afterEach(() => {
    clearRequestyModelCache()
    vi.useRealTimers()
  })

  it('normalizes, trims, and deduplicates model IDs with safe names and no pricing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response({ data: [
      { id: ' provider/model ', name: ' Friendly Name ', pricing: [{ prompt: '0.01', completion: '0.02' }] },
      { id: 'provider/model', name: 'Duplicate Name' },
      { id: 'display/model', display_name: 'Display Name', pricing: { prompt: '0' } },
      { id: 'fallback/model', name: { unsafe: 'object' } },
      { id: 'missing/name-only', display_name: ' ', pricing: [] },
      { name: 'No ID' },
    ] }))
    await expect(fetchRequestyModels({ apiKey: 'single-key', fetchFn })).resolves.toEqual([
      { value: 'provider/model', name: 'Friendly Name' },
      { value: 'display/model', name: 'Display Name' },
      { value: 'fallback/model', name: 'fallback/model' },
      { value: 'missing/name-only', name: 'missing/name-only' },
    ])
    expect(fetchFn).toHaveBeenCalledWith('https://router.requesty.ai/v1/models', expect.objectContaining({
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer single-key' },
      signal: expect.any(AbortSignal),
    }))
    expect(fetchFn.mock.calls[0][1].headers.Authorization).not.toContain('\n')
    expect(normalizeRequestyModels({ data: [{ id: 'x', pricing: [{ prompt: '999' }] }] })).toEqual([
      { value: 'x', name: 'x' },
    ])
  })

  it('sends no authorization for empty, blank, or non-string key input', async () => {
    for (const apiKey of ['', ' \n\t\n ', null]) {
      const fetchFn = vi.fn().mockResolvedValue(response({ data: [] }))
      await fetchRequestyModels({ apiKey, fetchFn })
      expect(fetchFn.mock.calls[0][1].headers).toEqual({ Accept: 'application/json' })
    }
  })

  it('uses the first parsed key but isolates cache entries by the full configured string', async () => {
    const configuredKey = ' first-key \n\n second-key\n'
    const fetchFn = vi.fn().mockResolvedValue(response({ data: [{ id: 'catalog/model' }] }))
    await fetchRequestyModels({ apiKey: configuredKey, fetchFn })
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer first-key')
    expect(getCachedRequestyModels(configuredKey)).toEqual([{ value: 'catalog/model', name: 'catalog/model' }])
    expect(getCachedRequestyModels('first-key\n\n second-key')).toBeNull()
  })

  it('caches an empty catalog, separates credentials, and expires entries after five minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await fetchRequestyModels({ apiKey: 'cache-key', fetchFn: vi.fn().mockResolvedValue(response({ data: [] })) })
    expect(getCachedRequestyModels('cache-key')).toEqual([])
    expect(getCachedRequestyModels('other-key')).toBeNull()
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(getCachedRequestyModels('cache-key')).toBeNull()
  })

  it.each([null, {}, { data: 'not-an-array' }, { data: [{ name: 'No valid ID' }] }])(
    'rejects malformed payload %j without caching', async payload => {
      await expect(fetchRequestyModels({
        apiKey: 'malformed-key',
        fetchFn: vi.fn().mockResolvedValue(response(payload)),
      })).rejects.toThrow('Invalid Requesty model list response')
      expect(getCachedRequestyModels('malformed-key')).toBeNull()
    }
  )

  it('rejects HTTP failures and timeout', async () => {
    await expect(fetchRequestyModels({
      apiKey: 'private-key',
      fetchFn: vi.fn().mockResolvedValue(response({}, false, 503)),
    })).rejects.toThrow('503')
    const waitsForAbort = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    await expect(fetchRequestyModels({ apiKey: 'private-key', fetchFn: waitsForAbort, timeoutMs: 5 }))
      .rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('does not cache a transport response that resolves after abort', async () => {
    let resolveTransport
    const fetchFn = vi.fn(() => new Promise(resolve => { resolveTransport = resolve }))
    const controller = new AbortController()
    const pending = fetchRequestyModels({ apiKey: 'late-transport-key', fetchFn, signal: controller.signal })
    controller.abort()
    resolveTransport(response({ data: [{ id: 'late/model' }] }))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedRequestyModels('late-transport-key')).toBeNull()
  })

  it('does not cache JSON that resolves after abort', async () => {
    let resolveJson
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => new Promise(resolve => { resolveJson = resolve }),
    })
    const controller = new AbortController()
    const pending = fetchRequestyModels({ apiKey: 'late-json-key', fetchFn, signal: controller.signal })
    await vi.waitFor(() => expect(resolveJson).toBeTypeOf('function'))
    controller.abort()
    resolveJson({ data: [{ id: 'late/model' }] })
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedRequestyModels('late-json-key')).toBeNull()
  })

  it('normalizes all 600 catalog entries without a truncation limit', () => {
    const models = normalizeRequestyModels({ data: Array.from({ length: 600 }, (_, index) => ({ id: `model/${index}` })) })
    expect(models).toHaveLength(600)
    expect(models.at(-1)).toEqual({ value: 'model/599', name: 'model/599' })
  })
})
