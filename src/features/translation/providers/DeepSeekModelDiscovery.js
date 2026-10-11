import { proxyManager } from '@/shared/proxy/ProxyManager.js'
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

const DEEPSEEK_MODELS_URL = 'https://api.deepseek.com/models'
const CACHE_TTL_MS = 5 * 60 * 1000
const modelCache = new Map()

export class MissingDeepSeekKeyError extends Error {
  constructor() {
    super('A DeepSeek API key is required for model discovery')
    this.name = 'MissingDeepSeekKeyError'
  }
}

function apiKeyFingerprint(apiKey) {
  const key = typeof apiKey === 'string' ? apiKey : ''
  if (!key) return 'anonymous'
  let first = 2166136261
  let second = 0x9e3779b9
  for (let index = 0; index < key.length; index++) {
    const code = key.charCodeAt(index)
    first = Math.imul(first ^ code, 16777619)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${key.length}:${first >>> 0}:${second >>> 0}`
}

export function normalizeDeepSeekModels(data) {
  if (!Array.isArray(data?.data)) return []
  const models = []
  const seen = new Set()
  for (const item of data.data) {
    const value = typeof item?.id === 'string' ? item.id.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    const name = typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : value
    models.push({ value, name })
  }
  return models
}

function isValidDeepSeekModelsPayload(data) {
  return data !== null
    && typeof data === 'object'
    && !Array.isArray(data)
    && Array.isArray(data.data)
    && (data.data.length === 0 || data.data.some(item => typeof item?.id === 'string' && item.id.trim()))
}

export function getCachedDeepSeekModels(apiKey = '', now = Date.now()) {
  const key = apiKeyFingerprint(apiKey)
  const entry = modelCache.get(key)
  if (!entry) return null
  if (now - entry.fetchedAt >= CACHE_TTL_MS) {
    modelCache.delete(key)
    return null
  }
  return entry.models.map(model => ({ ...model }))
}

export function clearDeepSeekModelCache() {
  modelCache.clear()
}

function throwIfAborted(signal) {
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
}

export async function fetchDeepSeekModels({
  apiKey = '',
  fetchFn,
  timeoutMs = 8000,
  signal,
} = {}) {
  const configuredKey = typeof apiKey === 'string' ? apiKey : ''
  const key = ApiKeyManager.parseKeys(configuredKey)[0]
  if (!key) throw new MissingDeepSeekKeyError()

  const controller = new AbortController()
  const abortFromOuter = () => controller.abort(signal?.reason)
  if (signal?.aborted) abortFromOuter()
  else signal?.addEventListener('abort', abortFromOuter, { once: true })
  const timeout = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs)
  try {
    const options = {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
    }
    const response = fetchFn
      ? await fetchFn(DEEPSEEK_MODELS_URL, options)
      : await (async () => {
        const proxyConfig = await resolveProxyConfig()
        return proxyManager.fetch(DEEPSEEK_MODELS_URL, options, proxyConfig)
      })()
    throwIfAborted(controller.signal)
    if (!response.ok) throw new Error(`DeepSeek model discovery failed (${response.status})`)
    const data = await response.json()
    throwIfAborted(controller.signal)
    if (!isValidDeepSeekModelsPayload(data)) throw new TypeError('Invalid DeepSeek model list response')
    const models = normalizeDeepSeekModels(data)
    modelCache.set(apiKeyFingerprint(configuredKey), { models, fetchedAt: Date.now() })
    return models
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromOuter)
  }
}
