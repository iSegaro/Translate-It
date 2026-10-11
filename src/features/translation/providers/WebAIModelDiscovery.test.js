import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearWebAIModelCache,
  fetchWebAIModels,
  getCachedWebAIModels,
  normalizeWebAIModels,
  resolveWebAIModelsUrl,
} from './WebAIModelDiscovery.js'

const response = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })

describe('WebAI model discovery', () => {
  afterEach(() => {
    clearWebAIModelCache()
    vi.useRealTimers()
  })

  it.each([
    [' https://host.test/v1/translate?key=x#hash ', 'https://host.test/v1/stateless/models'],
    ['https://host.test/base/v1/translate', 'https://host.test/base/v1/stateless/models'],
    ['https://host.test/v10/translate', 'https://host.test/v1/stateless/models'],
    ['https://host.test/v1beta/translate', 'https://host.test/v1/stateless/models'],
    ['https://host.test/', 'https://host.test/v1/stateless/models'],
    ['https://host.test/translate/', 'https://host.test/v1/stateless/models'],
    ['', null],
    ['not a url', null],
    ['file:///tmp/api', null],
  ])('derives discovery URL for %s', (input, expected) => {
    expect(resolveWebAIModelsUrl(input)).toBe(expected)
  })

  it('normalizes, trims, deduplicates and bounds OpenAI list model ids', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response({ data: [{ id: ' one ' }, { id: 'one' }, { id: '' }, { id: 4 }, { id: 'two' }] }))
    await expect(fetchWebAIModels('https://host.test/v1/translate', { fetchFn })).resolves.toEqual(['one', 'two'])
    expect(fetchFn).toHaveBeenCalledWith('https://host.test/v1/stateless/models', expect.objectContaining({
      method: 'GET', headers: { Accept: 'application/json' }, signal: expect.any(AbortSignal),
    }))
  })

  it.each([null, {}, { models: [{ id: 'x' }] }, { data: 'x' }])('returns empty for invalid list shape %j', data => {
    expect(normalizeWebAIModels(data)).toEqual([])
  })

  it.each([null, {}, { data: 'x' }, { data: [{ noid: true }] }])(
    'rejects malformed response %j without replacing a valid cache', async malformed => {
      const apiUrl = 'https://malformed.test/v1/translate'
      await fetchWebAIModels(apiUrl, {
        fetchFn: vi.fn().mockResolvedValue(response({ data: [{ id: 'cached-model' }] })),
      })
      await expect(fetchWebAIModels(apiUrl, {
        fetchFn: vi.fn().mockResolvedValue(response(malformed)),
      })).rejects.toThrow('Invalid WebAI model list response')
      expect(getCachedWebAIModels(apiUrl)).toEqual(['cached-model'])
    }
  )

  it('caches a valid empty model list', async () => {
    const apiUrl = 'https://empty.test'
    await expect(fetchWebAIModels(apiUrl, {
      fetchFn: vi.fn().mockResolvedValue(response({ data: [] })),
    })).resolves.toEqual([])
    expect(getCachedWebAIModels(apiUrl)).toEqual([])
  })

  it('rejects HTTP failures and times out', async () => {
    await expect(fetchWebAIModels('https://host.test', { fetchFn: vi.fn().mockResolvedValue(response({}, false, 503)) }))
      .rejects.toThrow('503')
    const fetchFn = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    await expect(fetchWebAIModels('https://host.test', { fetchFn, timeoutMs: 5 })).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('propagates an outer abort and caches successful models for five minutes', async () => {
    const controller = new AbortController()
    const fetchFn = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const pending = fetchWebAIModels('https://abort.test', { fetchFn, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toBeDefined()

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await fetchWebAIModels('https://cache.test/v1/translate', {
      fetchFn: vi.fn().mockResolvedValue(response({ data: [{ id: 'gemini-auto' }] })),
    })
    expect(getCachedWebAIModels('https://cache.test')).toEqual(['gemini-auto'])
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(getCachedWebAIModels('https://cache.test')).toBeNull()
  })

  it('does not write settings or switch a selected model', async () => {
    const settings = { WEBAI_API_MODEL: 'gemini-3-flash' }
    const fetchFn = vi.fn().mockResolvedValue(response({ data: [{ id: 'gemini-auto' }] }))
    const models = await fetchWebAIModels('https://no-write.test', { fetchFn })
    expect(models).toEqual(['gemini-auto'])
    expect(settings).toEqual({ WEBAI_API_MODEL: 'gemini-3-flash' })
    expect(fetchFn.mock.calls[0]).toHaveLength(2)
  })
})
