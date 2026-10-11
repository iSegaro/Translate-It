import { proxyManager } from '@/shared/proxy/ProxyManager.js'
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import { apiKeyFingerprint, createDiscoveryRequestSignal, getCachedEntry, throwIfAborted } from './modelDiscoveryUtils.js'

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models'
const modelCache = new Map()

export class MissingOpenAIKeyError extends Error {
  constructor() {
    super('An OpenAI API key is required for model discovery')
    this.name = 'MissingOpenAIKeyError'
  }
}

export function normalizeOpenAIModels(data) {
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

function isValidOpenAIModelsPayload(data) {
  return data !== null
    && typeof data === 'object'
    && !Array.isArray(data)
    && Array.isArray(data.data)
    && (data.data.length === 0 || data.data.some(item => typeof item?.id === 'string' && item.id.trim()))
}

export function getCachedOpenAIModels(apiKey = '', now = Date.now()) {
  const key = apiKeyFingerprint(apiKey)
  return getCachedEntry(modelCache, key, models => models.map(model => ({ ...model })), now)
}

export function clearOpenAIModelCache() {
  modelCache.clear()
}

export async function fetchOpenAIModels({
  apiKey = '',
  fetchFn,
  timeoutMs = 8000,
  signal,
} = {}) {
  const configuredKey = typeof apiKey === 'string' ? apiKey : ''
  const key = ApiKeyManager.parseKeys(configuredKey)[0]
  if (!key) throw new MissingOpenAIKeyError()

  const { signal: requestSignal, cleanup } = createDiscoveryRequestSignal(signal, timeoutMs)
  try {
    const options = {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
      signal: requestSignal,
    }
    const response = fetchFn
      ? await fetchFn(OPENAI_MODELS_URL, options)
      : await (async () => {
        const proxyConfig = await resolveProxyConfig()
        return proxyManager.fetch(OPENAI_MODELS_URL, options, proxyConfig)
      })()
    throwIfAborted(requestSignal)
    if (!response.ok) throw new Error(`OpenAI model discovery failed (${response.status})`)
    const data = await response.json()
    throwIfAborted(requestSignal)
    if (!isValidOpenAIModelsPayload(data)) throw new TypeError('Invalid OpenAI model list response')
    const models = normalizeOpenAIModels(data)
    modelCache.set(apiKeyFingerprint(configuredKey), { models, fetchedAt: Date.now() })
    return models
  } finally {
    cleanup()
  }
}
