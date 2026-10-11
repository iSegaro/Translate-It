export const MODEL_CACHE_TTL_MS = 5 * 60 * 1000

export function apiKeyFingerprint(apiKey) {
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

export function getCachedEntry(map, key, clone, now = Date.now()) {
  const entry = map.get(key)
  if (!entry) return null
  if (now - entry.fetchedAt >= MODEL_CACHE_TTL_MS) {
    map.delete(key)
    return null
  }
  return clone(entry.models)
}

export function createDiscoveryRequestSignal(outerSignal, timeoutMs) {
  const controller = new AbortController()
  const abortFromOuter = () => controller.abort(outerSignal?.reason)
  if (outerSignal?.aborted) abortFromOuter()
  else outerSignal?.addEventListener('abort', abortFromOuter, { once: true })
  const timeout = setTimeout(
    () => controller.abort(new DOMException('Timed out', 'TimeoutError')),
    timeoutMs
  )

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout)
      outerSignal?.removeEventListener('abort', abortFromOuter)
    },
  }
}

export function throwIfAborted(signal) {
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
}
