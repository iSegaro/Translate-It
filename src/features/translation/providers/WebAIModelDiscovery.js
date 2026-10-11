import { proxyManager } from '@/shared/proxy/ProxyManager.js'
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js'
import { createDiscoveryRequestSignal, getCachedEntry, throwIfAborted } from './modelDiscoveryUtils.js'

const modelCache = new Map()

/**
 * WebAI model discovery is rooted at the server's /v1 API. A full `v1` path
 * segment keeps any reverse-proxy base path before it and drops endpoint
 * suffixes; without that segment, misleading paths are ignored. Only HTTP(S)
 * URLs are accepted.
 */
export function resolveWebAIModelsUrl(apiUrl) {
  const value = typeof apiUrl === 'string' ? apiUrl.trim() : ''
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const segments = url.pathname.split('/').filter(Boolean)
    const versionIndex = segments.indexOf('v1')
    const prefix = versionIndex >= 0
      ? `/${[...segments.slice(0, versionIndex), 'v1'].join('/')}`
      : '/v1'
    return `${url.origin}${prefix}/stateless/models`
  } catch {
    return null
  }
}

export function normalizeWebAIModels(data) {
  if (!Array.isArray(data?.data)) return []
  const ids = new Set()
  for (const item of data.data) {
    if (typeof item?.id === 'string' && item.id.trim()) {
      ids.add(item.id.trim())
      if (ids.size >= 100) break
    }
  }
  return [...ids]
}

export function isValidModelsPayload(data) {
  return data !== null
    && typeof data === 'object'
    && !Array.isArray(data)
    && Array.isArray(data.data)
    && (data.data.length === 0 || data.data.some(item => typeof item?.id === 'string' && item.id.trim()))
}

export function getCachedWebAIModels(apiUrl, now = Date.now()) {
  const key = resolveWebAIModelsUrl(apiUrl)
  return key ? getCachedEntry(modelCache, key, models => [...models], now) : null
}

export function clearWebAIModelCache() {
  modelCache.clear()
}

export async function fetchWebAIModels(apiUrl, {
  fetchFn,
  timeoutMs = 5000,
  signal,
} = {}) {
  const url = resolveWebAIModelsUrl(apiUrl)
  if (!url) throw new TypeError('Invalid WebAI API URL')
  const { signal: requestSignal, cleanup } = createDiscoveryRequestSignal(signal, timeoutMs)
  try {
    const transport = fetchFn || (async (requestUrl, options) => {
      const proxyConfig = await resolveProxyConfig()
      return proxyManager.fetch(requestUrl, options, proxyConfig)
    })
    const response = await transport(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: requestSignal,
    })
    throwIfAborted(requestSignal)
    if (!response.ok) throw new Error(`WebAI model discovery failed (${response.status})`)
    const data = await response.json()
    throwIfAborted(requestSignal)
    if (!isValidModelsPayload(data)) throw new TypeError('Invalid WebAI model list response')
    const models = normalizeWebAIModels(data)
    modelCache.set(url, { models, fetchedAt: Date.now() })
    return models
  } finally {
    cleanup()
  }
}
