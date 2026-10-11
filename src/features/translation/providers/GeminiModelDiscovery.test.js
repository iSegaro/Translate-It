import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearGeminiModelCache,
  fetchGeminiModels,
  getCachedGeminiModels,
  MissingGeminiKeyError,
  normalizeGeminiModels,
} from './GeminiModelDiscovery.js'

vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }))
vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn().mockResolvedValue({}) }))

const response = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })
const model = (name, displayName = undefined, methods = ['generateContent']) => ({
  name,
  ...(displayName && { displayName }),
  supportedGenerationMethods: methods,
})

describe('Gemini model discovery', () => {
  afterEach(() => {
    clearGeminiModelCache()
    vi.useRealTimers()
  })

  it('uses the first parsed key and follows pages while filtering to generateContent models', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(response({
        models: [
          model('models/gemini-one', 'Gemini One'),
          model('models/embed-only', 'Embedding', ['embedContent']),
        ],
        nextPageToken: 'page-2',
      }))
      .mockResolvedValueOnce(response({
        models: [
          model('gemini-two'),
          model('models/gemini-one', 'Duplicate'),
        ],
      }))
    const configuredKey = ' first-key \n\n second-key '

    await expect(fetchGeminiModels({ apiKey: configuredKey, fetchFn })).resolves.toEqual([
      { value: 'gemini-one', name: 'Gemini One' },
      { value: 'gemini-two', name: 'gemini-two' },
    ])
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(new URL(fetchFn.mock.calls[0][0]).searchParams.get('key')).toBe('first-key')
    expect(new URL(fetchFn.mock.calls[1][0]).searchParams.get('pageToken')).toBe('page-2')
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'GET', signal: expect.any(AbortSignal) })
    expect(fetchFn.mock.calls[0][1].headers).toBeUndefined()
    expect(getCachedGeminiModels(configuredKey)).toEqual([
      { value: 'gemini-one', name: 'Gemini One' },
      { value: 'gemini-two', name: 'gemini-two' },
    ])
  })

  it('rejects missing keys before transport', async () => {
    const fetchFn = vi.fn()
    for (const apiKey of ['', ' \n\t\n ', null]) {
      await expect(fetchGeminiModels({ apiKey, fetchFn })).rejects.toBeInstanceOf(MissingGeminiKeyError)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('caches valid-empty catalogs, rejects malformed pages, and retains a prior complete cache', async () => {
    await expect(fetchGeminiModels({
      apiKey: 'empty-key',
      fetchFn: vi.fn().mockResolvedValue(response({ models: [] })),
    })).resolves.toEqual([])
    expect(getCachedGeminiModels('empty-key')).toEqual([])

    const key = 'valid-cache-key'
    await fetchGeminiModels({
      apiKey: key,
      fetchFn: vi.fn().mockResolvedValue(response({ models: [model('models/saved')] })),
    })
    for (const payload of [null, {}, { models: 'not-list' }, { models: [{ displayName: 'No name' }] }]) {
      await expect(fetchGeminiModels({
        apiKey: key,
        fetchFn: vi.fn().mockResolvedValue(response(payload)),
      })).rejects.toThrow('Invalid Gemini model list response')
      expect(getCachedGeminiModels(key)).toEqual([{ value: 'saved', name: 'saved' }])
    }
  })

  it('rejects repeated page tokens and does not cache a partial catalog', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(response({ models: [model('models/partial')], nextPageToken: 'loop' }))
      .mockResolvedValueOnce(response({ models: [model('models/partial-2')], nextPageToken: 'loop' }))
    await expect(fetchGeminiModels({ apiKey: 'loop-key', fetchFn })).rejects.toThrow('Repeated Gemini model page token')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(getCachedGeminiModels('loop-key')).toBeNull()
  })

  it('caches per full credential string for five minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const configuredKey = 'key-one\nkey-two'
    await fetchGeminiModels({
      apiKey: configuredKey,
      fetchFn: vi.fn().mockResolvedValue(response({ models: [model('models/cached')] })),
    })
    expect(getCachedGeminiModels(configuredKey)).toEqual([{ value: 'cached', name: 'cached' }])
    expect(getCachedGeminiModels('key-one\n\nkey-two')).toBeNull()
    expect(getCachedGeminiModels('another-key')).toBeNull()
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(getCachedGeminiModels(configuredKey)).toBeNull()
  })

  it('rejects HTTP failures and applies one timeout across pagination', async () => {
    await expect(fetchGeminiModels({
      apiKey: 'key',
      fetchFn: vi.fn().mockResolvedValue(response({}, false, 403)),
    })).rejects.toThrow('403')
    const waitsForAbort = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    await expect(fetchGeminiModels({ apiKey: 'key', fetchFn: waitsForAbort, timeoutMs: 5 }))
      .rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('aborts the entire pagination and does not cache partial models', async () => {
    const secondPage = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(response({ models: [model('models/first-page')], nextPageToken: 'next' }))
      .mockImplementationOnce(secondPage)
    const controller = new AbortController()
    const pending = fetchGeminiModels({ apiKey: 'partial-key', fetchFn, signal: controller.signal })
    await vi.waitFor(() => expect(secondPage).toHaveBeenCalled())
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedGeminiModels('partial-key')).toBeNull()
  })

  it('does not cache transport or JSON responses that complete after abort', async () => {
    let resolveTransport
    const transport = vi.fn(() => new Promise(resolve => { resolveTransport = resolve }))
    const transportController = new AbortController()
    const transportPending = fetchGeminiModels({ apiKey: 'late-transport', fetchFn: transport, signal: transportController.signal })
    transportController.abort()
    resolveTransport(response({ models: [model('models/late')] }))
    await expect(transportPending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedGeminiModels('late-transport')).toBeNull()

    let resolveJson
    const jsonFetch = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(resolve => { resolveJson = resolve }) })
    const jsonController = new AbortController()
    const jsonPending = fetchGeminiModels({ apiKey: 'late-json', fetchFn: jsonFetch, signal: jsonController.signal })
    await vi.waitFor(() => expect(resolveJson).toBeTypeOf('function'))
    jsonController.abort()
    resolveJson({ models: [model('models/late')] })
    await expect(jsonPending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedGeminiModels('late-json')).toBeNull()
  })

  it('normalizes catalogs larger than 500 models without truncation', () => {
    const models = normalizeGeminiModels({
      models: Array.from({ length: 700 }, (_, index) => model(`models/gemini-${index}`)),
    })
    expect(models).toHaveLength(700)
    expect(models.at(-1)).toEqual({ value: 'gemini-699', name: 'gemini-699' })
  })
})
