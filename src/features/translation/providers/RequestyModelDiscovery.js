import { proxyManager } from '@/shared/proxy/ProxyManager.js'
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

const REQUESTY_MODELS_URL = 'https://router.requesty.ai/v1/models'
const CACHE_TTL_MS = 5 * 60 * 1000
const modelCache = new Map()

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

function humanName(item, id) {
  for (const field of ['name', 'display_name', 'displayName', 'model_name', 'modelName']) {
    if (typeof item?.[field] === 'string' && item[field].trim()) return item[field].trim()
  }
  return id
}

export function normalizeRequestyModels(data) {
  if (!Array.isArray(data?.data)) return []
  const models = []
  const seen = new Set()
  for (const item of data.data) {
    const value = typeof item?.id === 'string' ? item.id.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    models.push({ value, name: humanName(item, value) })
  }
  return models
}

function isValidRequestyModelsPayload(data) {
  return data !== null
    && typeof data === 'object'
    && !Array.isArray(data)
    && Array.isArray(data.data)
    && (data.data.length === 0 || data.data.some(item => typeof item?.id === 'string' && item.id.trim()))
}

export function getCachedRequestyModels(apiKey = '', now = Date.now()) {
  const key = apiKeyFingerprint(apiKey)
  const entry = modelCache.get(key)
  if (!entry) return null
  if (now - entry.fetchedAt >= CACHE_TTL_MS) {
    modelCache.delete(key)
    return null
  }
  return entry.models.map(model => ({ ...model }))
}

export function clearRequestyModelCache() {
  modelCache.clear()
}

function throwIfAborted(signal) {
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
}

export async function fetchRequestyModels({
  apiKey = '',
  fetchFn,
  timeoutMs = 8000,
  signal,
} = {}) {
  const controller = new AbortController()
  const abortFromOuter = () => controller.abort(signal?.reason)
  if (signal?.aborted) abortFromOuter()
  else signal?.addEventListener('abort', abortFromOuter, { once: true })
  const timeout = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs)
  try {
    const configuredKey = typeof apiKey === 'string' ? apiKey : ''
    const key = ApiKeyManager.parseKeys(configuredKey)[0]
    const headers = { Accept: 'application/json' }
    if (key) headers.Authorization = `Bearer ${key}`
    const options = { method: 'GET', headers, signal: controller.signal }
    const response = fetchFn
      ? await fetchFn(REQUESTY_MODELS_URL, options)
      : await (async () => {
        const proxyConfig = await resolveProxyConfig()
        return proxyManager.fetch(REQUESTY_MODELS_URL, options, proxyConfig)
      })()
    throwIfAborted(controller.signal)
    if (!response.ok) throw new Error(`Requesty model discovery failed (${response.status})`)
    const data = await response.json()
    throwIfAborted(controller.signal)
    if (!isValidRequestyModelsPayload(data)) throw new TypeError('Invalid Requesty model list response')
    const models = normalizeRequestyModels(data)
    modelCache.set(apiKeyFingerprint(configuredKey), { models, fetchedAt: Date.now() })
    return models
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromOuter)
  }
}
