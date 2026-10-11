import { proxyManager } from '@/shared/proxy/ProxyManager.js'
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import { apiKeyFingerprint, createDiscoveryRequestSignal, getCachedEntry, throwIfAborted } from './modelDiscoveryUtils.js'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const modelCache = new Map()

function finitePrice(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeOpenRouterModels(data) {
  if (!Array.isArray(data?.data)) return []
  const models = []
  const seen = new Set()
  for (const item of data.data) {
    const value = typeof item?.id === 'string' ? item.id.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    const prompt = finitePrice(item?.pricing?.prompt)
    const completion = finitePrice(item?.pricing?.completion)
    models.push({
      value,
      name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : value,
      pricing: prompt !== null || completion !== null ? { prompt, completion } : null,
    })
  }
  return models
}

function isValidOpenRouterModelsPayload(data) {
  return data !== null
    && typeof data === 'object'
    && !Array.isArray(data)
    && Array.isArray(data.data)
    && (data.data.length === 0 || data.data.some(item => typeof item?.id === 'string' && item.id.trim()))
}

export function getCachedOpenRouterModels(apiKey = '', now = Date.now()) {
  const key = apiKeyFingerprint(apiKey)
  return getCachedEntry(modelCache, key, models => models.map(model => ({ ...model, pricing: model.pricing && { ...model.pricing } })), now)
}

export function clearOpenRouterModelCache() {
  modelCache.clear()
}

export async function fetchOpenRouterModels({
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
      ? await fetchFn(OPENROUTER_MODELS_URL, options)
      : await (async () => {
        const proxyConfig = await resolveProxyConfig()
        return proxyManager.fetch(OPENROUTER_MODELS_URL, options, proxyConfig)
      })()
    throwIfAborted(requestSignal)
    if (!response.ok) throw new Error(`OpenRouter model discovery failed (${response.status})`)
    const data = await response.json()
    throwIfAborted(requestSignal)
    if (!isValidOpenRouterModelsPayload(data)) throw new TypeError('Invalid OpenRouter model list response')
    const models = normalizeOpenRouterModels(data)
    modelCache.set(apiKeyFingerprint(configuredKey), { models, fetchedAt: Date.now() })
    return models
  } finally {
    cleanup()
  }
}
