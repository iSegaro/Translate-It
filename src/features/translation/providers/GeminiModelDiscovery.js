import { proxyManager } from '@/shared/proxy/ProxyManager.js'
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const CACHE_TTL_MS = 5 * 60 * 1000
const modelCache = new Map()

export class MissingGeminiKeyError extends Error {
  constructor() {
    super('A Gemini API key is required for model discovery')
    this.name = 'MissingGeminiKeyError'
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

function validPage(data) {
  return data !== null
    && typeof data === 'object'
    && !Array.isArray(data)
    && Array.isArray(data.models)
    && (data.nextPageToken === undefined || typeof data.nextPageToken === 'string')
    && (data.models.length === 0 || data.models.some(model => typeof model?.name === 'string' && model.name.trim()))
}

function toModelId(name) {
  const value = name.trim()
  return value.startsWith('models/') ? value.slice('models/'.length).trim() : value
}

export function normalizeGeminiModels(data) {
  if (!Array.isArray(data?.models)) return []
  const models = []
  const seen = new Set()
  for (const item of data.models) {
    if (!Array.isArray(item?.supportedGenerationMethods)
      || !item.supportedGenerationMethods.includes('generateContent')
      || typeof item.name !== 'string') continue
    const value = toModelId(item.name)
    if (!value || seen.has(value)) continue
    seen.add(value)
    const name = typeof item.displayName === 'string' && item.displayName.trim()
      ? item.displayName.trim()
      : value
    models.push({ value, name })
  }
  return models
}

export function getCachedGeminiModels(apiKey = '', now = Date.now()) {
  const key = apiKeyFingerprint(apiKey)
  const entry = modelCache.get(key)
  if (!entry) return null
  if (now - entry.fetchedAt >= CACHE_TTL_MS) {
    modelCache.delete(key)
    return null
  }
  return entry.models.map(model => ({ ...model }))
}

export function clearGeminiModelCache() {
  modelCache.clear()
}

function throwIfAborted(signal) {
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
}

export async function fetchGeminiModels({
  apiKey = '',
  fetchFn,
  timeoutMs = 8000,
  signal,
} = {}) {
  const configuredKey = typeof apiKey === 'string' ? apiKey : ''
  const key = ApiKeyManager.parseKeys(configuredKey)[0]
  if (!key) throw new MissingGeminiKeyError()

  const controller = new AbortController()
  const abortFromOuter = () => controller.abort(signal?.reason)
  if (signal?.aborted) abortFromOuter()
  else signal?.addEventListener('abort', abortFromOuter, { once: true })
  const timeout = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs)
  try {
    const proxyConfig = fetchFn ? null : await resolveProxyConfig()
    const models = []
    const seenModels = new Set()
    const requestedTokens = new Set()
    let pageToken

    do {
      throwIfAborted(controller.signal)
      if (pageToken) {
        if (requestedTokens.has(pageToken)) throw new TypeError('Repeated Gemini model page token')
        requestedTokens.add(pageToken)
      }
      const url = new URL(GEMINI_MODELS_URL)
      url.searchParams.set('key', key)
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const options = { method: 'GET', signal: controller.signal }
      const response = fetchFn
        ? await fetchFn(url.toString(), options)
        : await proxyManager.fetch(url.toString(), options, proxyConfig)
      throwIfAborted(controller.signal)
      if (!response.ok) throw new Error(`Gemini model discovery failed (${response.status})`)
      const data = await response.json()
      throwIfAborted(controller.signal)
      if (!validPage(data)) throw new TypeError('Invalid Gemini model list response')
      for (const model of normalizeGeminiModels(data)) {
        if (seenModels.has(model.value)) continue
        seenModels.add(model.value)
        models.push(model)
      }
      pageToken = data.nextPageToken || undefined
      if (pageToken && requestedTokens.has(pageToken)) throw new TypeError('Repeated Gemini model page token')
    } while (pageToken)

    modelCache.set(apiKeyFingerprint(configuredKey), { models, fetchedAt: Date.now() })
    return models
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromOuter)
  }
}
