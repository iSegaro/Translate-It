import { proxyManager } from '@/shared/proxy/ProxyManager.js'
import { resolveProxyConfig, resolveProxyConfigFromSettings } from '@/shared/proxy/ProxySettings.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import { apiKeyFingerprint, throwIfAborted } from './modelDiscoveryUtils.js'

export const DEEPL_LANGUAGE_CATALOG_TTL_MS = 5 * 60 * 1000
export const DEEPL_LANGUAGE_DISCOVERY_TIMEOUT_MS = 8000

const catalogCache = new Map()
// Identity-bound in-flight sharing: equivalent credential/tier callers
// coalesce onto one network request. Each caller keeps independent
// abort/timeout handling; the shared fetch aborts only when no
// subscribers remain. Late responses after all subscribers leave or after
// a cache clear are never cached.
const inFlightDiscoveries = new Map()
const DEEPL_LANGUAGE_URLS = {
  free: 'https://api-free.deepl.com/v3/languages?resource=translate_text&include=beta',
  pro: 'https://api.deepl.com/v3/languages?resource=translate_text&include=beta',
}
const VALID_DIRECTIONS = new Set(['source', 'target'])
const VALID_STATUSES = new Set(['stable', 'beta', 'early_access'])
const DEEPL_CHINESE_ALIASES = {
  source: new Map([
    ['zh-cn', 'zh'], ['zh-tw', 'zh'], ['zh-hans', 'zh'], ['zh-hant', 'zh'],
  ]),
  target: new Map([
    ['zh-cn', 'zh-hans'], ['zh-hans', 'zh-hans'],
    ['zh-tw', 'zh-hant'], ['zh-hant', 'zh-hant'],
  ]),
}

export class MissingDeepLLanguageKeyError extends Error {
  constructor() {
    super('A DeepL API key is required for language discovery')
    this.name = 'MissingDeepLLanguageKeyError'
  }
}

export class DeepLLanguageDiscoveryError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'DeepLLanguageDiscoveryError'
  }
}

export class SupersededDeepLLanguageDiscoveryError extends Error {
  constructor() {
    super('DeepL language discovery response was superseded by a newer request')
    this.name = 'SupersededDeepLLanguageDiscoveryError'
  }
}

export class MalformedDeepLLanguageCatalogError extends TypeError {
  constructor(options) {
    super('Invalid DeepL language catalog response', options)
    this.name = 'MalformedDeepLLanguageCatalogError'
  }
}

/** Normalize case and underscore separators without collapsing tag variants. */
export function normalizeDeepLLanguageTag(tag) {
  return typeof tag === 'string' ? tag.trim().replace(/_/g, '-').toLowerCase() : ''
}

/** Resolve only the Chinese variants explicitly mapped by DeepL runtime codes. */
export function resolveDeepLLanguageTag(tag, direction) {
  const normalizedTag = normalizeDeepLLanguageTag(tag)
  if (!VALID_DIRECTIONS.has(direction)) return normalizedTag
  return DEEPL_CHINESE_ALIASES[direction].get(normalizedTag) || normalizedTag
}

function isValidLanguageTag(tag) {
  try {
    return Intl.getCanonicalLocales(tag).length === 1
  } catch {
    return false
  }
}

function normalizedTier(apiTier) {
  return apiTier === 'pro' ? 'pro' : 'free'
}

/** Tier-eligible DeepL credentials in configured order. Never logs raw keys. */
export function getDeepLEligibleKeys(configuredKeys, apiTier = 'free') {
  const tier = normalizedTier(apiTier)
  return ApiKeyManager.parseKeys(typeof configuredKeys === 'string' ? configuredKeys : '')
    .filter(candidate => tier !== 'pro' || !candidate.endsWith(':fx'))
}

function selectEffectiveKey(configuredKeys, tier) {
  return getDeepLEligibleKeys(configuredKeys, tier)[0] || ''
}

/** Identity is based on the same tier-eligible key discovery will use. */
export function getDeepLLanguageIdentity(configuredKeys, apiTier = 'free') {
  const tier = normalizedTier(apiTier)
  const key = selectEffectiveKey(configuredKeys, tier)
  if (!key) throw new MissingDeepLLanguageKeyError()
  return `${tier}:${apiKeyFingerprint(key)}`
}

function cloneCatalog(catalog) {
  return catalog.map(language => ({ ...language, features: { ...language.features } }))
}

function cloneSnapshot(snapshot) {
  return { ...snapshot, catalog: cloneCatalog(snapshot.catalog) }
}

function cloneProxyConfig(config) {
  return {
    enabled: Boolean(config?.enabled),
    type: config?.type || 'http',
    host: config?.host || '',
    port: config?.port || 8080,
    auth: {
      username: config?.auth?.username || '',
      password: config?.auth?.password || '',
    },
  }
}

function getProxyRoutingFingerprint(config) {
  // Hash canonical config including auth, so equivalent routing coalesces
  // without exposing proxy credentials in the in-flight map key.
  return apiKeyFingerprint(JSON.stringify(config))
}

/**
 * Normalize the v3 language payload. Unknown optional metadata stays null,
 * never being coerced into an unsupported direction or stable status.
 */
export function normalizeDeepLLanguageCatalog(data) {
  if (!Array.isArray(data) || data.length === 0) throw new MalformedDeepLLanguageCatalogError()

  const result = []
  const seen = new Set()
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || typeof item.lang !== 'string' || !normalizeDeepLLanguageTag(item.lang)
      || !isValidLanguageTag(normalizeDeepLLanguageTag(item.lang))) {
      throw new MalformedDeepLLanguageCatalogError()
    }

    const normalizedTag = normalizeDeepLLanguageTag(item.lang)
    if (seen.has(normalizedTag)) throw new MalformedDeepLLanguageCatalogError()
    seen.add(normalizedTag)

    const status = VALID_STATUSES.has(item.status) ? item.status : null
    const featuresValid = item.features !== null && typeof item.features === 'object' && !Array.isArray(item.features)
    const formalityPresent = featuresValid && Object.prototype.hasOwnProperty.call(item.features, 'formality')
    const formalityObject = formalityPresent && item.features.formality !== null
      && typeof item.features.formality === 'object' && !Array.isArray(item.features.formality)
    const formalityStatus = formalityObject && ['stable', 'beta'].includes(item.features.formality.status)
      ? item.features.formality.status
      : null
    const formalitySupport = !featuresValid || (formalityPresent && !formalityObject)
      ? 'unknown'
      : !formalityPresent
        ? 'unsupported'
        : formalityStatus
          ? 'supported'
          : 'unknown'

    // tag_handling is an independent source-and-target capability: a present
    // object means supported, an absent key means unsupported, and malformed
    // metadata (missing/invalid features, non-object value) means unknown.
    // It is never conflated with formality support or beta status.
    const tagHandlingPresent = featuresValid && Object.prototype.hasOwnProperty.call(item.features, 'tag_handling')
    const tagHandlingObject = tagHandlingPresent && item.features.tag_handling !== null
      && typeof item.features.tag_handling === 'object' && !Array.isArray(item.features.tag_handling)
    const tagHandlingSupport = !featuresValid || (tagHandlingPresent && !tagHandlingObject)
      ? 'unknown'
      : !tagHandlingPresent
        ? 'unsupported'
        : 'supported'

    result.push({
      lang: item.lang.trim(),
      normalizedTag,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null,
      usableAsSource: typeof item.usable_as_source === 'boolean' ? item.usable_as_source : null,
      usableAsTarget: typeof item.usable_as_target === 'boolean' ? item.usable_as_target : null,
      status,
      isBeta: status === 'beta',
      metadataValid: typeof item.name === 'string' && Boolean(item.name.trim())
        && typeof item.usable_as_source === 'boolean'
        && typeof item.usable_as_target === 'boolean'
        && status !== null,
      features: { formalityStatus, formalitySupport, tagHandlingSupport },
    })
  }

  const catalogComplete = result.every(language => language.metadataValid)
  result.forEach(language => { language.catalogComplete = catalogComplete })
  return result
}

/**
 * Match only exact normalized tags. `unknown` means no usable fresh catalog,
 * malformed direction metadata, or otherwise insufficient capability data;
 * callers must not treat it as unsupported.
 */
export function matchDeepLLanguage(catalog, languageTag, direction) {
  if (!Array.isArray(catalog) || !languageTag || !VALID_DIRECTIONS.has(direction)) return 'unknown'
  const normalizedTag = normalizeDeepLLanguageTag(languageTag)
  if (!normalizedTag || !isValidLanguageTag(normalizedTag)) return 'unknown'

  const resolvedTag = resolveDeepLLanguageTag(normalizedTag, direction)
  const entry = catalog.find(language => language.normalizedTag === resolvedTag)
  if (!entry) return catalog.some(language => language.catalogComplete === false) ? 'unknown' : 'unsupported'
  if (!entry.metadataValid || !VALID_STATUSES.has(entry.status)) return 'unknown'
  const usable = direction === 'source' ? entry.usableAsSource : entry.usableAsTarget
  if (typeof usable !== 'boolean') return 'unknown'
  return usable ? 'supported' : 'unsupported'
}

/** Formality capability is based only on the v3 feature metadata. */
export function matchDeepLFormality(catalog, languageTag) {
  if (!Array.isArray(catalog) || !languageTag) return 'unknown'
  const normalizedTag = normalizeDeepLLanguageTag(languageTag)
  if (!normalizedTag || !isValidLanguageTag(normalizedTag)) return 'unknown'
  const resolvedTag = resolveDeepLLanguageTag(normalizedTag, 'target')
  const entry = catalog.find(language => language.normalizedTag === resolvedTag)
  if (!entry && catalog.some(language => language.catalogComplete === false)) return 'unknown'
  if (entry && (!entry.metadataValid || !VALID_STATUSES.has(entry.status))) return 'unknown'
  if (entry && entry.usableAsTarget !== true) return entry.usableAsTarget === false ? 'unsupported' : 'unknown'
  return entry?.features?.formalitySupport ?? 'unknown'
}

function matchDeepLTagHandlingDirection(catalog, languageTag, direction) {
  if (!Array.isArray(catalog) || !languageTag) return 'unknown'
  const normalizedTag = normalizeDeepLLanguageTag(languageTag)
  if (!normalizedTag || !isValidLanguageTag(normalizedTag)) return 'unknown'
  const resolvedTag = resolveDeepLLanguageTag(normalizedTag, direction)
  const entry = catalog.find(language => language.normalizedTag === resolvedTag)
  if (!entry && catalog.some(language => language.catalogComplete === false)) return 'unknown'
  if (!entry) return 'unsupported'
  if (!entry.metadataValid || !VALID_STATUSES.has(entry.status)) return 'unknown'
  const usable = direction === 'source' ? entry.usableAsSource : entry.usableAsTarget
  if (usable !== true) return usable === false ? 'unsupported' : 'unknown'
  return entry?.features?.tagHandlingSupport ?? 'unknown'
}

/**
 * tag_handling is a source-and-target feature: both records must confirm
 * support. An auto source cannot be pre-verified (the detected language is
 * unknown), so only the target record is checked. Missing or malformed
 * capability metadata yields `unknown`, never `unsupported`.
 */
export function matchDeepLTagHandling(catalog, sourceTag, targetTag) {
  if (!Array.isArray(catalog)) return 'unknown'
  const normalizedSource = typeof sourceTag === 'string' ? normalizeDeepLLanguageTag(sourceTag) : ''
  const isAutoSource = !normalizedSource || normalizedSource === 'auto'
  const targetResult = matchDeepLTagHandlingDirection(catalog, targetTag, 'target')
  if (isAutoSource) return targetResult
  const sourceResult = matchDeepLTagHandlingDirection(catalog, sourceTag, 'source')
  if (sourceResult === 'supported' && targetResult === 'supported') return 'supported'
  if (sourceResult === 'unknown' || targetResult === 'unknown') return 'unknown'
  return 'unsupported'
}

export function getCachedDeepLLanguageCatalog(apiKey = '', apiTier = 'free', now = Date.now()) {
  const identity = getDeepLLanguageIdentity(apiKey, apiTier)
  const entry = catalogCache.get(identity)
  if (!entry) return null
  if (now - entry.fetchedAt >= DEEPL_LANGUAGE_CATALOG_TTL_MS) {
    catalogCache.delete(identity)
    return null
  }
  return cloneSnapshot(entry)
}

export function clearDeepLLanguageCatalogCache() {
  catalogCache.clear()
  // Cleared identity must never receive the late shared response: drop the
  // entries so completion cannot cache, abort the network work, and reject
  // waiting callers as superseded instead of resolving stale data.
  for (const [identity, entry] of Array.from(inFlightDiscoveries)) {
    inFlightDiscoveries.delete(identity)
    entry.sharedController.abort(new SupersededDeepLLanguageDiscoveryError())
    for (const subscriber of Array.from(entry.subscribers)) {
      if (subscriber.settled) continue
      subscriber.settled = true
      if (subscriber.timer) clearTimeout(subscriber.timer)
      if (subscriber.signal && subscriber.onAbort) subscriber.signal.removeEventListener('abort', subscriber.onAbort)
      subscriber.reject(new SupersededDeepLLanguageDiscoveryError())
    }
    entry.subscribers.clear()
  }
}

function raceWithSharedAbort(promise, sharedSignal) {
  if (sharedSignal.aborted) {
    return Promise.reject(sharedSignal.reason ?? new DOMException('Aborted', 'AbortError'))
  }
  let onAbort
  const abortPromise = new Promise((_, reject) => {
    onAbort = () => reject(sharedSignal.reason ?? new DOMException('Aborted', 'AbortError'))
    sharedSignal.addEventListener('abort', onAbort, { once: true })
  })
  return Promise.race([
    Promise.resolve(promise).finally(() => sharedSignal.removeEventListener('abort', onAbort)),
    abortPromise,
  ])
}

async function runSharedDeepLDiscovery(entry) {
  const { sharedController, key, tier, fetchFn } = entry
  const sharedSignal = sharedController.signal
  try {
    throwIfAborted(sharedSignal)
    const url = DEEPL_LANGUAGE_URLS[tier]
    const options = {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `DeepL-Auth-Key ${key}`,
      },
      signal: sharedSignal,
    }
    const response = await raceWithSharedAbort(
      fetchFn
        ? fetchFn(url, options)
        : (async () => {
          const proxyConfig = entry.proxyConfig
          throwIfAborted(sharedSignal)
          return proxyManager.fetch(url, options, cloneProxyConfig(proxyConfig))
        })(),
      sharedSignal,
    )
    throwIfAborted(sharedSignal)
    if (!response?.ok) {
      const discoveryError = new DeepLLanguageDiscoveryError(`DeepL language discovery failed (${response?.status ?? 'network'})`)
      // Structured status for the 401-only key-failover policy below.
      if (Number.isInteger(response?.status)) discoveryError.statusCode = response.status
      throw discoveryError
    }

    let data
    try {
      data = await raceWithSharedAbort(response.json(), sharedSignal)
    } catch (cause) {
      throwIfAborted(sharedSignal)
      throw new MalformedDeepLLanguageCatalogError({ cause })
    }
    throwIfAborted(sharedSignal)
    const catalog = normalizeDeepLLanguageCatalog(data)

    // Never serve or cache a response nobody waits for or that was cleared.
    if (inFlightDiscoveries.get(entry.inFlightKey) !== entry || entry.subscribers.size === 0) {
      throw new SupersededDeepLLanguageDiscoveryError()
    }

    const snapshot = { catalog, identity: entry.identity, fetchedAt: entry.now() }
    catalogCache.set(entry.identity, snapshot)
    inFlightDiscoveries.delete(entry.inFlightKey)
    return snapshot
  } catch (error) {
    if (inFlightDiscoveries.get(entry.inFlightKey) === entry) inFlightDiscoveries.delete(entry.inFlightKey)
    throw error
  }
}

function attachToSharedDiscovery(entry, { signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const subscriber = { resolve, reject, signal, timer: null, onAbort: null, settled: false }
    const detachForCallerExit = (error) => {
      if (subscriber.settled) return
      subscriber.settled = true
      if (subscriber.timer) clearTimeout(subscriber.timer)
      if (signal && subscriber.onAbort) signal.removeEventListener('abort', subscriber.onAbort)
      entry.subscribers.delete(subscriber)
      // Cancel the shared network work only once nobody remains subscribed.
      if (entry.subscribers.size === 0 && inFlightDiscoveries.get(entry.inFlightKey) === entry) {
        inFlightDiscoveries.delete(entry.inFlightKey)
        entry.sharedController.abort(new DOMException('Aborted', 'AbortError'))
      }
      reject(error)
    }

    subscriber.onAbort = () => {
      detachForCallerExit(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    if (signal?.aborted) {
      detachForCallerExit(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    if (signal) signal.addEventListener('abort', subscriber.onAbort, { once: true })
    subscriber.timer = setTimeout(() => {
      detachForCallerExit(new DOMException('Timed out', 'TimeoutError'))
    }, timeoutMs)

    entry.subscribers.add(subscriber)
    entry.sharedPromise.then(
      (snapshot) => {
        if (subscriber.settled) return
        subscriber.settled = true
        clearTimeout(subscriber.timer)
        if (signal && subscriber.onAbort) signal.removeEventListener('abort', subscriber.onAbort)
        entry.subscribers.delete(subscriber)
        resolve(cloneSnapshot(snapshot))
      },
      (error) => {
        if (subscriber.settled) return
        subscriber.settled = true
        clearTimeout(subscriber.timer)
        if (signal && subscriber.onAbort) signal.removeEventListener('abort', subscriber.onAbort)
        entry.subscribers.delete(subscriber)
        reject(error)
      },
    )
  })
}

/** Fetch a fresh catalog or return a fresh, identity-bound cached catalog. */
export async function fetchDeepLLanguageCatalog({
  apiKey = '',
  apiTier = 'free',
  fetchFn,
  now = Date.now,
  timeoutMs = DEEPL_LANGUAGE_DISCOVERY_TIMEOUT_MS,
  signal,
  proxySettings,
} = {}) {
  const configuredKey = typeof apiKey === 'string' ? apiKey : ''
  const tier = normalizedTier(apiTier)
  // Keep selection aligned with DeepLTranslateProvider._getConfig(): Pro
  // credentials ending in :fx are Free keys and are not eligible.
  const key = selectEffectiveKey(configuredKey, tier)
  if (!key) throw new MissingDeepLLanguageKeyError()

  if (signal) throwIfAborted(signal)
  const identity = getDeepLLanguageIdentity(configuredKey, tier)
  const cached = getCachedDeepLLanguageCatalog(key, tier, now())
  if (cached) return cached

  // Resolve/copy routing before joining an in-flight request. Requests with
  // the same credential but different draft/saved proxies must not coalesce.
  const proxyConfig = proxySettings === undefined
    ? cloneProxyConfig(fetchFn
      ? { enabled: false, type: 'http', host: '', port: 8080, auth: { username: '', password: '' } }
      : await resolveProxyConfig())
    : cloneProxyConfig(resolveProxyConfigFromSettings(proxySettings))
  if (signal) throwIfAborted(signal)
  const inFlightKey = `${identity}:${getProxyRoutingFingerprint(proxyConfig)}`

  // Equivalent credential/tier callers share one network request so a
  // concurrent refresh cannot supersede a runtime capability lookup.
  const existing = inFlightDiscoveries.get(inFlightKey)
  if (existing) return attachToSharedDiscovery(existing, { signal, timeoutMs })

  const entry = {
    identity,
    inFlightKey,
    tier,
    key,
    proxyConfig,
    fetchFn,
    now,
    sharedController: new AbortController(),
    sharedPromise: null,
    subscribers: new Set(),
  }
  entry.sharedPromise = runSharedDeepLDiscovery(entry)
  // A shared rejection with zero remaining subscribers is already reported
  // per caller; keep it from surfacing as unhandled.
  entry.sharedPromise.catch(() => {})
  inFlightDiscoveries.set(inFlightKey, entry)
  return attachToSharedDiscovery(entry, { signal, timeoutMs })
}

/**
 * Capability discovery with translation-style key failover: try each
 * tier-eligible key in configured order, advancing to the next key only on
 * HTTP 401 (invalid key — the same 401-only rotation policy as translation
 * failover in DeepLTranslateProvider.shouldFailoverApiKey). Every other
 * failure (network, timeout, abort, malformed catalog, non-401 status)
 * propagates immediately without probing the next key. Failures never
 * populate the cache, so a dead key poisons nothing and the snapshot is
 * cached under the succeeding key's identity only. Callers must not
 * reorder or promote keys here; promotion belongs to the translation
 * success path.
 */
export async function fetchDeepLLanguageCatalogWithKeyFailover({
  apiKey = '',
  apiTier = 'free',
  fetchFn,
  now = Date.now,
  timeoutMs = DEEPL_LANGUAGE_DISCOVERY_TIMEOUT_MS,
  signal,
  proxySettings,
} = {}) {
  const configuredKeys = typeof apiKey === 'string' ? apiKey : ''
  const tier = normalizedTier(apiTier)
  const keys = getDeepLEligibleKeys(configuredKeys, tier)
  if (keys.length === 0) throw new MissingDeepLLanguageKeyError()
  if (signal) throwIfAborted(signal)

  // Serve a fresh per-key cache hit before spending network work, so a
  // known-good key short-circuits without re-probing a dead first key.
  for (const key of keys) {
    const cached = getCachedDeepLLanguageCatalog(key, tier, now())
    if (cached) return cached
  }

  let lastAuthError = null
  for (const key of keys) {
    if (signal) throwIfAborted(signal)
    try {
      return await fetchDeepLLanguageCatalog({ apiKey: key, apiTier: tier, fetchFn, now, timeoutMs, signal, proxySettings })
    } catch (error) {
      if (Number(error?.statusCode) === 401) {
        lastAuthError = error
        continue
      }
      throw error
    }
  }
  throw lastAuthError
}
