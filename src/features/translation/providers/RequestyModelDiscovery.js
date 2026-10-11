import { proxyManager } from '@/shared/proxy/ProxyManager.js'
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import { apiKeyFingerprint, createDiscoveryRequestSignal, getCachedEntry, throwIfAborted } from './modelDiscoveryUtils.js'

const REQUESTY_MODELS_URL = 'https://router.requesty.ai/v1/models'
const modelCache = new Map()

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
  return getCachedEntry(modelCache, key, models => models.map(model => ({ ...model })), now)
}

export function clearRequestyModelCache() {
  modelCache.clear()
}

export async function fetchRequestyModels({
  apiKey = '',
  fetchFn,
  timeoutMs = 8000,
  signal,
} = {}) {
  const { signal: requestSignal, cleanup } = createDiscoveryRequestSignal(signal, timeoutMs)
  try {
    const configuredKey = typeof apiKey === 'string' ? apiKey : ''
    const key = ApiKeyManager.parseKeys(configuredKey)[0]
    const headers = { Accept: 'application/json' }
    if (key) headers.Authorization = `Bearer ${key}`
    const options = { method: 'GET', headers, signal: requestSignal }
    const response = fetchFn
      ? await fetchFn(REQUESTY_MODELS_URL, options)
      : await (async () => {
        const proxyConfig = await resolveProxyConfig()
        return proxyManager.fetch(REQUESTY_MODELS_URL, options, proxyConfig)
      })()
    throwIfAborted(requestSignal)
    if (!response.ok) throw new Error(`Requesty model discovery failed (${response.status})`)
    const data = await response.json()
    throwIfAborted(requestSignal)
    if (!isValidRequestyModelsPayload(data)) throw new TypeError('Invalid Requesty model list response')
    const models = normalizeRequestyModels(data)
    modelCache.set(apiKeyFingerprint(configuredKey), { models, fetchedAt: Date.now() })
    return models
  } finally {
    cleanup()
  }
}
