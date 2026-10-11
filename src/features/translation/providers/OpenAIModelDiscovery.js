import { proxyManager } from '@/shared/proxy/ProxyManager.js'
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models'
const CACHE_TTL_MS = 5 * 60 * 1000
const modelCache = new Map()

export class MissingOpenAIKeyError extends Error {
  constructor() {
    super('An OpenAI API key is required for model discovery')
    this.name = 'MissingOpenAIKeyError'
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
  const entry = modelCache.get(key)
  if (!entry) return null
  if (now - entry.fetchedAt >= CACHE_TTL_MS) {
    modelCache.delete(key)
    return null
  }
  return entry.models.map(model => ({ ...model }))
}

export function clearOpenAIModelCache() {
  modelCache.clear()
}

function throwIfAborted(signal) {
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
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
      ? await fetchFn(OPENAI_MODELS_URL, options)
      : await (async () => {
        const proxyConfig = await resolveProxyConfig()
        return proxyManager.fetch(OPENAI_MODELS_URL, options, proxyConfig)
      })()
    throwIfAborted(controller.signal)
    if (!response.ok) throw new Error(`OpenAI model discovery failed (${response.status})`)
    const data = await response.json()
    throwIfAborted(controller.signal)
    if (!isValidOpenAIModelsPayload(data)) throw new TypeError('Invalid OpenAI model list response')
    const models = normalizeOpenAIModels(data)
    modelCache.set(apiKeyFingerprint(configuredKey), { models, fetchedAt: Date.now() })
    return models
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromOuter)
  }
}
