import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearDeepLLanguageCatalogCache,
  DeepLLanguageDiscoveryError,
  fetchDeepLLanguageCatalog,
  fetchDeepLLanguageCatalogWithKeyFailover,
  getCachedDeepLLanguageCatalog,
  getDeepLEligibleKeys,
  getDeepLLanguageIdentity,
  MalformedDeepLLanguageCatalogError,
  matchDeepLLanguage,
  matchDeepLFormality,
  matchDeepLTagHandling,
  MissingDeepLLanguageKeyError,
  normalizeDeepLLanguageCatalog,
  normalizeDeepLLanguageTag,
  resolveDeepLLanguageTag,
  SupersededDeepLLanguageDiscoveryError,
} from './DeepLLanguageDiscovery.js'

const proxyDiscoveryMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  persisted: vi.fn(async () => ({ enabled: false, type: 'http', host: '', port: 8080, auth: { username: '', password: '' } })),
}))

vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: proxyDiscoveryMocks.fetch } }))
vi.mock('@/shared/proxy/ProxySettings.js', () => ({
  resolveProxyConfig: (...args) => proxyDiscoveryMocks.persisted(...args),
  resolveProxyConfigFromSettings: (settings = {}) => ({
    enabled: Boolean(settings.PROXY_ENABLED),
    type: settings.PROXY_TYPE || 'http',
    host: settings.PROXY_HOST || '',
    port: settings.PROXY_PORT || 8080,
    auth: { username: settings.PROXY_USERNAME || '', password: settings.PROXY_PASSWORD || '' },
  }),
}))

const payload = [
  { lang: 'EN', name: 'English', usable_as_source: true, usable_as_target: true, status: 'stable', features: { formality: { status: 'stable' } } },
  { lang: 'PT-BR', name: 'Portuguese (Brazilian)', usable_as_source: true, usable_as_target: true, status: 'beta', features: {} },
  { lang: 'ZH-HANS', name: 'Chinese (Simplified)', usable_as_source: false, usable_as_target: true, status: 'early_access' },
  { lang: 'QAA', name: 'Unknown metadata', status: 'future_status' },
]

const response = (data = payload, ok = true, status = 200) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(data),
})

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  clearDeepLLanguageCatalogCache()
  proxyDiscoveryMocks.fetch.mockReset()
  proxyDiscoveryMocks.persisted.mockClear()
  vi.useRealTimers()
})

describe('DeepL language discovery', () => {
  it('normalizes catalog metadata and preserves BCP47 variants', () => {
    const catalog = normalizeDeepLLanguageCatalog(payload)

    expect(catalog[0]).toMatchObject({
      lang: 'EN', normalizedTag: 'en', name: 'English',
      usableAsSource: true, usableAsTarget: true, status: 'stable',
      isBeta: false, metadataValid: true,
      features: { formalityStatus: 'stable', formalitySupport: 'supported' },
    })
    expect(catalog[1]).toMatchObject({ lang: 'PT-BR', normalizedTag: 'pt-br', status: 'beta', isBeta: true, metadataValid: true })
    expect(catalog[2]).toMatchObject({ lang: 'ZH-HANS', normalizedTag: 'zh-hans', status: 'early_access', isBeta: false })
    expect(catalog[3]).toMatchObject({ lang: 'QAA', normalizedTag: 'qaa', status: null, usableAsSource: null, usableAsTarget: null, metadataValid: false })
    expect(normalizeDeepLLanguageTag('zh_Hant')).toBe('zh-hant')
    expect(normalizeDeepLLanguageTag('zh-hant')).not.toBe(normalizeDeepLLanguageTag('zh-hans'))
  })

  it('matches direction independently and returns unknown for absent metadata', () => {
    const catalog = normalizeDeepLLanguageCatalog([
      ...payload,
      { lang: 'zh', name: 'Chinese', usable_as_source: false, usable_as_target: true, status: 'stable', features: {} },
    ])

    expect(matchDeepLLanguage(catalog, 'en', 'source')).toBe('supported')
    expect(matchDeepLLanguage(catalog, 'ZH_hans', 'source')).toBe('unsupported')
    expect(matchDeepLLanguage(catalog, 'zh-hans', 'target')).toBe('supported')
    expect(matchDeepLLanguage(catalog, 'pt_br', 'target')).toBe('supported')
    expect(matchDeepLLanguage(catalog, 'qaa', 'target')).toBe('unknown')
    expect(matchDeepLLanguage(undefined, 'tl', 'target')).toBe('unknown')
    expect(matchDeepLLanguage(catalog, 'pt', 'target')).toBe('unknown')
    expect(matchDeepLLanguage(normalizeDeepLLanguageCatalog(payload.slice(0, 3)), 'pt', 'target')).toBe('unsupported')
  })

  it('resolves only the explicit source and target Chinese aliases', () => {
    const catalog = normalizeDeepLLanguageCatalog([
      { lang: 'zh', name: 'Chinese', usable_as_source: true, usable_as_target: true, status: 'stable', features: {} },
      { lang: 'zh-Hans', name: 'Simplified Chinese', usable_as_source: false, usable_as_target: true, status: 'stable', features: { formality: { status: 'stable' } } },
      { lang: 'zh-Hant', name: 'Traditional Chinese', usable_as_source: false, usable_as_target: true, status: 'stable', features: { formality: { status: 'beta' } } },
    ])

    expect(resolveDeepLLanguageTag('ZH_CN', 'source')).toBe('zh')
    expect(resolveDeepLLanguageTag('zh-TW', 'source')).toBe('zh')
    expect(resolveDeepLLanguageTag('zh-Hant', 'source')).toBe('zh')
    expect(resolveDeepLLanguageTag('zh_CN', 'target')).toBe('zh-hans')
    expect(resolveDeepLLanguageTag('zh-TW', 'target')).toBe('zh-hant')
    expect(resolveDeepLLanguageTag('pt-BR', 'target')).toBe('pt-br')
    expect(matchDeepLLanguage(catalog, 'zh-cn', 'source')).toBe('supported')
    expect(matchDeepLLanguage(catalog, 'zh-hant', 'source')).toBe('supported')
    expect(matchDeepLLanguage(catalog, 'zh-cn', 'target')).toBe('supported')
    expect(matchDeepLLanguage(catalog, 'zh-tw', 'target')).toBe('supported')
    expect(matchDeepLFormality(catalog, 'zh-cn')).toBe('supported')
    expect(matchDeepLFormality(catalog, 'zh-tw')).toBe('supported')
  })

  it('checks the resolved catalog entry direction and preserves non-alias variants', () => {
    const catalog = normalizeDeepLLanguageCatalog([
      { lang: 'zh', name: 'Chinese', usable_as_source: false, usable_as_target: true, status: 'stable', features: {} },
      { lang: 'zh-Hans', name: 'Simplified Chinese', usable_as_source: true, usable_as_target: false, status: 'stable', features: { formality: { status: 'stable' } } },
      { lang: 'pt-BR', name: 'Brazilian Portuguese', usable_as_source: true, usable_as_target: true, status: 'stable', features: {} },
      { lang: 'en-GB', name: 'British English', usable_as_source: true, usable_as_target: true, status: 'stable', features: {} },
    ])

    expect(matchDeepLLanguage(catalog, 'zh-CN', 'source')).toBe('unsupported')
    expect(matchDeepLLanguage(catalog, 'zh-cn', 'target')).toBe('unsupported')
    expect(matchDeepLFormality(catalog, 'zh-cn')).toBe('unsupported')
    expect(matchDeepLLanguage(catalog, 'pt', 'target')).toBe('unsupported')
    expect(matchDeepLLanguage(catalog, 'pt-BR', 'target')).toBe('supported')
    expect(matchDeepLLanguage(catalog, 'en-US', 'target')).toBe('unsupported')
    expect(matchDeepLLanguage(catalog, 'en-GB', 'target')).toBe('supported')
  })

  it('returns unsupported for a missing Chinese base in a complete catalog, unknown in an incomplete one', () => {
    const completeCatalog = normalizeDeepLLanguageCatalog([
      { lang: 'en', name: 'English', usable_as_source: true, usable_as_target: true, status: 'stable', features: {} },
    ])
    const incompleteCatalog = normalizeDeepLLanguageCatalog([
      { lang: 'qaa', name: 'Unknown', usable_as_source: true, usable_as_target: true, status: 'future_status', features: {} },
    ])

    expect(matchDeepLLanguage(completeCatalog, 'zh-CN', 'target')).toBe('unsupported')
    expect(matchDeepLLanguage(incompleteCatalog, 'zh-CN', 'target')).toBe('unknown')
    expect(matchDeepLFormality(completeCatalog, 'zh-TW')).toBe('unknown')
  })

  it('does not match unknown status as supported or unsupported despite true directions', () => {
    const catalog = normalizeDeepLLanguageCatalog([{
      lang: 'qaa', name: 'Unknown status', usable_as_source: true,
      usable_as_target: true, status: 'future_status', features: {},
    }])

    expect(matchDeepLLanguage(catalog, 'qaa', 'source')).toBe('unknown')
    expect(matchDeepLLanguage(catalog, 'qaa', 'target')).toBe('unknown')
  })

  it('exposes formality as supported, unsupported, or unknown from v3 feature metadata', () => {
    const catalog = normalizeDeepLLanguageCatalog([
      { ...payload[0], lang: 'en', features: { formality: { status: 'stable' } } },
      { ...payload[0], lang: 'de', features: { formality: { status: 'beta' } } },
      { ...payload[0], lang: 'fr', features: {} },
      { ...payload[0], lang: 'es', features: undefined },
      { ...payload[0], lang: 'it', features: { formality: { status: 'future' } } },
      { ...payload[0], lang: 'nl', usable_as_target: false, features: { formality: { status: 'stable' } } },
      { ...payload[0], lang: 'sv', status: 'future_status', features: { formality: { status: 'beta' } } },
    ])

    expect(matchDeepLFormality(catalog, 'en')).toBe('supported')
    expect(catalog.find(item => item.normalizedTag === 'en').features.formalityStatus).toBe('stable')
    expect(matchDeepLFormality(catalog, 'de')).toBe('supported')
    expect(catalog.find(item => item.normalizedTag === 'de').features.formalityStatus).toBe('beta')
    expect(matchDeepLFormality(catalog, 'fr')).toBe('unsupported')
    expect(matchDeepLFormality(catalog, 'es')).toBe('unknown')
    expect(matchDeepLFormality(catalog, 'it')).toBe('unknown')
    expect(matchDeepLFormality(catalog, 'nl')).toBe('unsupported')
    expect(matchDeepLFormality(catalog, 'sv')).toBe('unknown')
  })

  it('uses the v3 endpoint, authorization format, and tier-specific hosts', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response())

    await fetchDeepLLanguageCatalog({ apiKey: 'free-key', apiTier: 'free', fetchFn })
    await fetchDeepLLanguageCatalog({ apiKey: 'pro-key', apiTier: 'pro', fetchFn })

    expect(fetchFn.mock.calls[0][0]).toBe('https://api-free.deepl.com/v3/languages?resource=translate_text&include=beta')
    expect(fetchFn.mock.calls[1][0]).toBe('https://api.deepl.com/v3/languages?resource=translate_text&include=beta')
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('DeepL-Auth-Key free-key')
    expect(fetchFn.mock.calls[0][1].method).toBe('GET')
  })

  it('caches by exact credential and tier identity, without retaining credentials in identity', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response())
    const now = () => 1000

    await fetchDeepLLanguageCatalog({ apiKey: 'same-key', apiTier: 'free', fetchFn, now })
    await fetchDeepLLanguageCatalog({ apiKey: 'same-key', apiTier: 'free', fetchFn, now })
    await fetchDeepLLanguageCatalog({ apiKey: 'same-key', apiTier: 'pro', fetchFn, now })
    await fetchDeepLLanguageCatalog({ apiKey: 'different-key', apiTier: 'free', fetchFn, now })

    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(getDeepLLanguageIdentity('same-key', 'free')).not.toContain('same-key')
    expect(getDeepLLanguageIdentity('same-key', 'free')).not.toBe(getDeepLLanguageIdentity('same-key', 'pro'))
    expect(getCachedDeepLLanguageCatalog('same-key', 'free', 1000).catalog).toHaveLength(4)
    expect(getCachedDeepLLanguageCatalog('same-key', 'pro', 1000).catalog).toHaveLength(4)
    expect(getCachedDeepLLanguageCatalog('different-key', 'free', 1000).catalog).toHaveLength(4)
  })

  it('uses the same eligible Pro key for fetch, identity, and cache; rejects when none qualify', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response())
    const configuredKeys = 'free-key:fx\npro-key'
    const snapshot = await fetchDeepLLanguageCatalog({
      apiKey: configuredKeys, apiTier: 'pro', fetchFn,
    })

    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('DeepL-Auth-Key pro-key')
    expect(snapshot.identity).toBe(getDeepLLanguageIdentity(configuredKeys, 'pro'))
    expect(getCachedDeepLLanguageCatalog(configuredKeys, 'pro').identity).toBe(snapshot.identity)
    const cached = await fetchDeepLLanguageCatalog({ apiKey: configuredKeys, apiTier: 'pro', fetchFn })
    expect(cached).toEqual(snapshot)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    await expect(fetchDeepLLanguageCatalog({ apiKey: 'free-key:fx', apiTier: 'pro', fetchFn }))
      .rejects.toBeInstanceOf(MissingDeepLLanguageKeyError)
  })

  it('expires cache entries at the five-minute TTL and fetches fresh data', async () => {
    let now = 100
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response(payload.slice(0, 1)))

    await fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn, now: () => now })
    const hit = getCachedDeepLLanguageCatalog('key', 'free', now + 299_999)
    expect(hit.catalog).toHaveLength(4)
    expect(hit.fetchedAt).toBe(100)
    expect(hit.identity).toBe(getDeepLLanguageIdentity('key', 'free'))
    expect(getCachedDeepLLanguageCatalog('key', 'free', now + 300_000)).toBeNull()

    now += 300_000
    const refreshed = await fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn, now: () => now })
    expect(refreshed.catalog).toHaveLength(1)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('distinguishes a missing key from request failure and does not serve stale data on failure', async () => {
    await expect(fetchDeepLLanguageCatalog({ apiKey: '  \n ' })).rejects.toBeInstanceOf(MissingDeepLLanguageKeyError)

    const now = () => 1000
    await fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn: vi.fn().mockResolvedValue(response()), now })
    const expired = 1000 + 300_000
    await expect(fetchDeepLLanguageCatalog({
      apiKey: 'key', now: () => expired, fetchFn: vi.fn().mockRejectedValue(new TypeError('offline')),
    })).rejects.toThrow('offline')
    await expect(fetchDeepLLanguageCatalog({
      apiKey: 'other', fetchFn: vi.fn().mockResolvedValue(response(null, false, 503)),
    })).rejects.toBeInstanceOf(DeepLLanguageDiscoveryError)
  })

  it('does not cache malformed root or duplicate tags; unknown metadata remains unknown', async () => {
    expect(() => normalizeDeepLLanguageCatalog({ languages: payload })).toThrow(MalformedDeepLLanguageCatalogError)
    expect(() => normalizeDeepLLanguageCatalog([payload[0], { ...payload[0], lang: 'en' }])).toThrow(MalformedDeepLLanguageCatalogError)

    const fetchFn = vi.fn().mockResolvedValue(response([{ lang: 'qaa', name: 'Unknown' }]))
    const snapshot = await fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn })
    expect(matchDeepLLanguage(snapshot.catalog, 'qaa', 'source')).toBe('unknown')
  })

  it('aborts in-flight requests and does not cache their late responses', async () => {
    let resolveFetch
    const fetchFn = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))
    const controller = new AbortController()
    const pending = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn, signal: controller.signal })

    controller.abort()
    resolveFetch(response())

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(getCachedDeepLLanguageCatalog('key')).toBeNull()
  })

  it('keeps a late response bound to its original key and tier identity', async () => {
    let resolveOld
    const fetchFn = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValueOnce(response(payload.slice(0, 1)))

    const oldPending = fetchDeepLLanguageCatalog({ apiKey: 'old-key', apiTier: 'free', fetchFn })
    const current = await fetchDeepLLanguageCatalog({ apiKey: 'new-key', apiTier: 'pro', fetchFn })
    resolveOld(response())
    await oldPending

    expect(current.catalog).toHaveLength(1)
    expect(getCachedDeepLLanguageCatalog('new-key', 'pro').catalog).toHaveLength(1)
    expect(getCachedDeepLLanguageCatalog('old-key', 'free').catalog).toHaveLength(4)
  })

  it('rejects an already-aborted signal even when a fresh cache entry exists', async () => {
    await fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn: vi.fn().mockResolvedValue(response()) })
    const controller = new AbortController()
    controller.abort()

    await expect(fetchDeepLLanguageCatalog({ apiKey: 'key', signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('resolves concurrent same-identity callers with the same shared snapshot', async () => {
    let resolveFetch
    const now = vi.fn(() => 1234)
    const fetchFn = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))

    const oldPending = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn, now })
    const newerPending = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn, now })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    resolveFetch(response(payload.slice(0, 1)))
    const [older, newer] = await Promise.all([oldPending, newerPending])

    expect(older.catalog).toHaveLength(1)
    expect(newer).toEqual(older)
    expect(newer.catalog).not.toBe(older.catalog)
    expect(newer.fetchedAt).toBe(1234)
    expect(getCachedDeepLLanguageCatalog('key', 'free', 1234).catalog).toHaveLength(1)
    // Two lookup timestamps and one successful response timestamp; the
    // shared response did not manufacture its own fetchedAt.
    expect(now).toHaveBeenCalledTimes(3)
  })

  it('rejects every same-identity subscriber when the shared request fails', async () => {
    let rejectFetch
    const fetchFn = vi.fn(() => new Promise((_, reject) => { rejectFetch = reject }))

    const first = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn })
    const second = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    rejectFetch(new TypeError('shared request failed'))
    await expect(first).rejects.toThrow('shared request failed')
    await expect(second).rejects.toThrow('shared request failed')
    expect(getCachedDeepLLanguageCatalog('key')).toBeNull()
  })

  it('keeps the shared request alive when only one caller aborts', async () => {
    let resolveFetch
    const fetchFn = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))
    const controller = new AbortController()

    const aborted = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn, signal: controller.signal })
    const surviving = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(1)

    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })

    resolveFetch(response())
    const snapshot = await surviving
    expect(snapshot.catalog).toHaveLength(4)
    expect(getCachedDeepLLanguageCatalog('key').catalog).toHaveLength(4)
  })

  it('caches nothing when every subscriber leaves before the response lands', async () => {
    let resolveFetch
    const fetchFn = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))
    const firstController = new AbortController()
    const secondController = new AbortController()

    const first = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn, signal: firstController.signal })
    const second = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn, signal: secondController.signal })
    firstController.abort()
    secondController.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })

    resolveFetch(response())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(getCachedDeepLLanguageCatalog('key')).toBeNull()
  })

  it('applies timeouts per caller without cancelling the shared request', async () => {
    vi.useFakeTimers()
    try {
      let resolveFetch
      const fetchFn = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))

      const shortPending = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn, timeoutMs: 1000 })
      const longPending = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn, timeoutMs: 8000 })
      const shortExpectation = expect(shortPending).rejects.toMatchObject({ name: 'TimeoutError' })
      await vi.advanceTimersByTimeAsync(1000)
      await shortExpectation
      expect(fetchFn).toHaveBeenCalledTimes(1)

      resolveFetch(response())
      const snapshot = await longPending
      expect(snapshot.catalog).toHaveLength(4)
      expect(getCachedDeepLLanguageCatalog('key').catalog).toHaveLength(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('times out an unresolved persisted proxy read at the original deadline', async () => {
    vi.useFakeTimers()
    try {
      const proxyRead = deferred()
      proxyDiscoveryMocks.persisted.mockReturnValue(proxyRead.promise)
      const pending = fetchDeepLLanguageCatalog({ apiKey: 'proxy-timeout-key', timeoutMs: 1000 })
      const expectedFailure = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })

      await vi.advanceTimersByTimeAsync(1000)
      await expectedFailure
      expect(proxyDiscoveryMocks.fetch).not.toHaveBeenCalled()
      expect(getCachedDeepLLanguageCatalog('proxy-timeout-key')).toBeNull()

      // A late storage result is consumed but cannot start a request.
      proxyRead.resolve({ enabled: true, type: 'http', host: 'late.proxy', port: 80, auth: {} })
      await Promise.resolve()
      await Promise.resolve()
      expect(proxyDiscoveryMocks.fetch).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts promptly during proxy resolution and ignores that caller late result while a same-route caller succeeds', async () => {
    const proxyReads = []
    proxyDiscoveryMocks.persisted.mockImplementation(() => {
      const read = deferred()
      proxyReads.push(read)
      return read.promise
    })
    proxyDiscoveryMocks.fetch.mockResolvedValue(response(payload.slice(0, 1)))
    const firstController = new AbortController()

    const first = fetchDeepLLanguageCatalog({ apiKey: 'proxy-abort-key', signal: firstController.signal })
    const second = fetchDeepLLanguageCatalog({ apiKey: 'proxy-abort-key' })
    const firstExpectation = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    firstController.abort()
    await firstExpectation

    const sameProxy = {
      enabled: true,
      type: 'http',
      host: 'same.proxy',
      port: 8000,
      auth: { username: '', password: '' },
    }
    proxyReads[0].resolve(sameProxy)
    proxyReads[1].resolve(sameProxy)
    const snapshot = await second

    expect(snapshot.catalog).toHaveLength(1)
    expect(proxyDiscoveryMocks.fetch).toHaveBeenCalledTimes(1)
    expect(proxyDiscoveryMocks.fetch.mock.calls[0][2]).toEqual(sameProxy)
    expect(getCachedDeepLLanguageCatalog('proxy-abort-key').catalog).toHaveLength(1)
  })

  it('uses only the remaining caller deadline after proxy resolution', async () => {
    vi.useFakeTimers()
    try {
      const proxyRead = deferred()
      const network = deferred()
      proxyDiscoveryMocks.persisted.mockReturnValue(proxyRead.promise)
      proxyDiscoveryMocks.fetch.mockReturnValue(network.promise)
      const pending = fetchDeepLLanguageCatalog({ apiKey: 'remaining-budget-key', timeoutMs: 1000 })
      const expectedFailure = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })

      await vi.advanceTimersByTimeAsync(400)
      proxyRead.resolve({ enabled: true, type: 'http', host: 'partial.proxy', port: 80, auth: {} })
      await Promise.resolve()
      await Promise.resolve()
      expect(proxyDiscoveryMocks.fetch).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(599)
      expect(getCachedDeepLLanguageCatalog('remaining-budget-key')).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      await expectedFailure

      network.resolve(response())
      await Promise.resolve()
      await Promise.resolve()
      expect(getCachedDeepLLanguageCatalog('remaining-budget-key')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not reset the original timeout when failover advances after a 401', async () => {
    vi.useFakeTimers()
    try {
      const firstNetwork = deferred()
      const secondNetwork = deferred()
      const fetchFn = vi.fn()
        .mockReturnValueOnce(firstNetwork.promise)
        .mockReturnValueOnce(secondNetwork.promise)
      const pending = fetchDeepLLanguageCatalogWithKeyFailover({
        apiKey: 'first-timeout-key\nsecond-timeout-key',
        fetchFn,
        timeoutMs: 1000,
      })
      const expectedFailure = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })

      await vi.advanceTimersByTimeAsync(700)
      firstNetwork.resolve(response(null, false, 401))
      await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
      await vi.advanceTimersByTimeAsync(299)
      expect(getCachedDeepLLanguageCatalog('second-timeout-key')).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      await expectedFailure

      secondNetwork.resolve(response())
      await Promise.resolve()
      await Promise.resolve()
      expect(getCachedDeepLLanguageCatalog('first-timeout-key')).toBeNull()
      expect(getCachedDeepLLanguageCatalog('second-timeout-key')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('isolates concurrent discoveries by credential and tier identity', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(payload.slice(0, 1)))

    const [freeSnapshot, proSnapshot] = await Promise.all([
      fetchDeepLLanguageCatalog({ apiKey: 'key', apiTier: 'free', fetchFn }),
      fetchDeepLLanguageCatalog({ apiKey: 'key', apiTier: 'pro', fetchFn }),
    ])

    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(freeSnapshot.identity).not.toBe(proSnapshot.identity)
    expect(getCachedDeepLLanguageCatalog('key', 'free').catalog).toHaveLength(1)
    expect(getCachedDeepLLanguageCatalog('key', 'pro').catalog).toHaveLength(1)
  })

  it('rejects in-flight callers as superseded on clear and never caches the late response', async () => {
    let resolveFetch
    const fetchFn = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))

    const pending = fetchDeepLLanguageCatalog({ apiKey: 'key', fetchFn })
    const pendingExpectation = expect(pending).rejects.toBeInstanceOf(SupersededDeepLLanguageDiscoveryError)
    clearDeepLLanguageCatalogCache()
    await pendingExpectation

    resolveFetch(response())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(getCachedDeepLLanguageCatalog('key')).toBeNull()
  })

  it('captures tag_handling support independently of formality and beta status', () => {
    const catalog = normalizeDeepLLanguageCatalog([
      { lang: 'en', name: 'English', usable_as_source: true, usable_as_target: true, status: 'stable', features: { formality: { status: 'stable' }, tag_handling: {} } },
      { lang: 'de', name: 'German', usable_as_source: true, usable_as_target: true, status: 'beta', features: { formality: {}, tag_handling: {} } },
      { lang: 'fr', name: 'French', usable_as_source: true, usable_as_target: true, status: 'stable', features: {} },
      { lang: 'es', name: 'Spanish', usable_as_source: true, usable_as_target: true, status: 'stable', features: { tag_handling: ['xml'] } },
      { lang: 'it', name: 'Italian', usable_as_source: true, usable_as_target: true, status: 'stable' },
    ])

    expect(catalog[0].features.tagHandlingSupport).toBe('supported')
    expect(catalog[1].features.tagHandlingSupport).toBe('supported')
    expect(catalog[2].features.tagHandlingSupport).toBe('unsupported')
    expect(catalog[3].features.tagHandlingSupport).toBe('unknown')
    expect(catalog[4].features.tagHandlingSupport).toBe('unknown')
    // Formality is tracked separately and beta status does not imply support.
    expect(catalog[0].features.formalitySupport).toBe('supported')
    expect(catalog[1].features.formalitySupport).toBe('unknown')
    expect(catalog[1].isBeta).toBe(true)
  })

  it('matches tag_handling on both records, with auto source checking target only', () => {
    const catalog = normalizeDeepLLanguageCatalog([
      { lang: 'en', name: 'English', usable_as_source: true, usable_as_target: true, status: 'stable', features: { tag_handling: {} } },
      { lang: 'de', name: 'German', usable_as_source: true, usable_as_target: true, status: 'stable', features: { tag_handling: {} } },
      { lang: 'fr', name: 'French', usable_as_source: true, usable_as_target: true, status: 'stable', features: {} },
      { lang: 'qaa', name: 'Unknown', status: 'future_status' },
    ])

    expect(matchDeepLTagHandling(catalog, 'en', 'de')).toBe('supported')
    expect(matchDeepLTagHandling(catalog, 'en', 'fr')).toBe('unsupported')
    expect(matchDeepLTagHandling(catalog, 'fr', 'de')).toBe('unsupported')
    expect(matchDeepLTagHandling(catalog, 'auto', 'de')).toBe('supported')
    expect(matchDeepLTagHandling(catalog, 'auto', 'fr')).toBe('unsupported')
    expect(matchDeepLTagHandling(catalog, 'auto', 'qaa')).toBe('unknown')
    expect(matchDeepLTagHandling(catalog, 'en', 'qaa')).toBe('unknown')
    expect(matchDeepLTagHandling(catalog, 'en', 'xx-missing')).toBe('unknown')
    expect(matchDeepLTagHandling(undefined, 'en', 'de')).toBe('unknown')
  })

  it('lists tier-eligible keys in configured order for failover', () => {
    expect(getDeepLEligibleKeys('bad-key\n good-key ', 'free')).toEqual(['bad-key', 'good-key'])
    expect(getDeepLEligibleKeys('free-key:fx\npro-key', 'pro')).toEqual(['pro-key'])
    expect(getDeepLEligibleKeys('free-key:fx\npro-key', 'free')).toEqual(['free-key:fx', 'pro-key'])
    expect(getDeepLEligibleKeys('  \n ', 'free')).toEqual([])
    expect(getDeepLEligibleKeys('free-key:fx', 'pro')).toEqual([])
  })

  it('fails over to the next eligible key on 401 and caches only the succeeding identity', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(response(null, false, 401))
      .mockResolvedValueOnce(response())

    const snapshot = await fetchDeepLLanguageCatalogWithKeyFailover({ apiKey: 'bad-key\ngood-key', fetchFn })

    expect(snapshot.catalog).toHaveLength(4)
    expect(snapshot.identity).toBe(getDeepLLanguageIdentity('good-key', 'free'))
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('DeepL-Auth-Key bad-key')
    expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe('DeepL-Auth-Key good-key')
    expect(getCachedDeepLLanguageCatalog('bad-key')).toBeNull()
    expect(getCachedDeepLLanguageCatalog('good-key').catalog).toHaveLength(4)
  })

  it('serves a fresh succeeding-key cache hit without re-probing the dead first key', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(response(null, false, 401))
      .mockResolvedValueOnce(response())

    await fetchDeepLLanguageCatalogWithKeyFailover({ apiKey: 'bad-key\ngood-key', fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    const cached = await fetchDeepLLanguageCatalogWithKeyFailover({ apiKey: 'bad-key\ngood-key', fetchFn })
    expect(cached.catalog).toHaveLength(4)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('fails fast when every eligible key returns 401 without caching', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(null, false, 401))

    await expect(fetchDeepLLanguageCatalogWithKeyFailover({ apiKey: 'bad-1\nbad-2', fetchFn }))
      .rejects.toMatchObject({ name: 'DeepLLanguageDiscoveryError', statusCode: 401 })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(getCachedDeepLLanguageCatalog('bad-1')).toBeNull()
    expect(getCachedDeepLLanguageCatalog('bad-2')).toBeNull()
  })

  it.each([[403], [500]])('does not fail over on HTTP %s', async (status) => {
    const fetchFn = vi.fn().mockResolvedValue(response(null, false, status))

    await expect(fetchDeepLLanguageCatalogWithKeyFailover({ apiKey: 'key-1\nkey-2', fetchFn }))
      .rejects.toMatchObject({ statusCode: status })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('does not fail over on network or malformed failures', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('offline'))
    await expect(fetchDeepLLanguageCatalogWithKeyFailover({ apiKey: 'key-1\nkey-2', fetchFn: offline }))
      .rejects.toThrow('offline')
    expect(offline).toHaveBeenCalledTimes(1)

    const malformed = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    await expect(fetchDeepLLanguageCatalogWithKeyFailover({ apiKey: 'key-3\nkey-4', fetchFn: malformed }))
      .rejects.toBeInstanceOf(MalformedDeepLLanguageCatalogError)
    expect(malformed).toHaveBeenCalledTimes(1)
  })

  it('rejects failover without network work when no key is tier-eligible', async () => {
    const fetchFn = vi.fn()

    await expect(fetchDeepLLanguageCatalogWithKeyFailover({ apiKey: 'free-key:fx', apiTier: 'pro', fetchFn }))
      .rejects.toBeInstanceOf(MissingDeepLLanguageKeyError)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('propagates caller abort without probing the next key', async () => {
    let resolveFetch
    const fetchFn = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))
    const controller = new AbortController()

    const pending = fetchDeepLLanguageCatalogWithKeyFailover({ apiKey: 'slow-key\nnext-key', fetchFn, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchFn).toHaveBeenCalledTimes(1)

    resolveFetch(response())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(getCachedDeepLLanguageCatalog('slow-key')).toBeNull()
    expect(getCachedDeepLLanguageCatalog('next-key')).toBeNull()
  })

  it('keeps same-key requests with different proxy routes separate and isolates caller aborts', async () => {
    let resolveDraftRoute
    const draftResponse = new Promise(resolve => { resolveDraftRoute = resolve })
    proxyDiscoveryMocks.fetch.mockImplementation((_url, _options, proxyConfig) => (
      proxyConfig.host === 'draft.proxy.test'
        ? draftResponse
        : Promise.resolve(response(payload.slice(0, 1)))
    ))
    const savedProxy = {
      enabled: true,
      type: 'http',
      host: 'saved.proxy.test',
      port: 8000,
      auth: { username: 'saved-user', password: 'saved-password' },
    }
    proxyDiscoveryMocks.persisted.mockResolvedValue(savedProxy)
    const draftSettings = {
      PROXY_ENABLED: true,
      PROXY_TYPE: 'socks',
      PROXY_HOST: 'draft.proxy.test',
      PROXY_PORT: 1080,
      PROXY_USERNAME: 'draft-user',
      PROXY_PASSWORD: 'draft-password',
    }
    const draftController = new AbortController()

    const draftPending = fetchDeepLLanguageCatalog({ apiKey: 'same-key', proxySettings: draftSettings, signal: draftController.signal })
    const savedPending = fetchDeepLLanguageCatalog({ apiKey: 'same-key', fetchFn: undefined })
    await expect(savedPending).resolves.toMatchObject({ catalog: expect.any(Array) })

    expect(proxyDiscoveryMocks.fetch).toHaveBeenCalledTimes(2)
    expect(proxyDiscoveryMocks.fetch.mock.calls[0][2]).toEqual({
      enabled: true,
      type: 'socks',
      host: 'draft.proxy.test',
      port: 1080,
      auth: { username: 'draft-user', password: 'draft-password' },
    })
    expect(proxyDiscoveryMocks.fetch.mock.calls[1][2]).toEqual(savedProxy)
    expect(proxyDiscoveryMocks.fetch.mock.calls[0][2]).not.toBe(draftSettings)

    draftController.abort()
    await expect(draftPending).rejects.toMatchObject({ name: 'AbortError' })
    resolveDraftRoute(response())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(getCachedDeepLLanguageCatalog('same-key')).toMatchObject({ catalog: expect.any(Array) })
  })
})
