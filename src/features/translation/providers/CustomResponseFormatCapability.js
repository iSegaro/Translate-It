/**
 * CustomResponseFormatCapability - Single authoritative owner of the Custom
 * provider's runtime response_format (json_object) capability.
 *
 * Tri-state per endpoint: absent = unknown (probe with response_format),
 * 'supported' | 'unsupported' otherwise. Runtime-memory only for the current
 * extension context lifetime. No persistence, no listeners, no second cache.
 *
 * Also owns the ONE generic rejection classifier policy shared by the
 * translation path (CustomProvider) and the connection probe
 * (CustomConnectionProbe). Import it; do not duplicate the patterns.
 */

// Generic rejection signals for the response_format field. No
// product-specific branches: any server rejecting the field this way falls
// back, including LM Studio's "'response_format.type' must be ...".
const UNSUPPORTED_RESPONSE_FORMAT_PATTERNS = [
  /\b(?:unknown|unsupported|unrecognized|invalid)\s+(?:parameter|field|property|key|value|type)?\s*[:=]?\s*[`'" ]*response_format\b/i,
  /[`'"]?response_format[`'"]?\s+(?:is\s+)?(?:not\s+supported|unsupported|unrecognized|unknown|invalid|rejected)\b/i,
  /[`'"]?response_format(?:\.\w+)?[`'"]?\s+must\s+be\b/i,
];

export const CUSTOM_RESPONSE_FORMAT_SUPPORT = Object.freeze({
  SUPPORTED: 'supported',
  UNSUPPORTED: 'unsupported',
});

const customResponseFormatSupportCache = new Map();

/**
 * Builds the deterministic cache key for response_format capability.
 * Conservative normalization: trim + trailing-slash trim only, case preserved.
 * @param {string} apiUrl - Custom endpoint URL.
 * @param {string} model - Custom model name.
 * @returns {string|null} Cache key, or null when keying facts are missing.
 */
export function normalizeCustomResponseFormatCacheKey(apiUrl, model) {
  const normalizedUrl = String(apiUrl ?? '').trim().replace(/\/+$/, '');
  const normalizedModel = String(model ?? '').trim();
  if (!normalizedUrl || !normalizedModel) return null;
  return `${normalizedUrl}||${normalizedModel}`;
}

/**
 * Reads the cached capability for an endpoint. Unknown when absent.
 * @param {string} apiUrl - Custom endpoint URL.
 * @param {string} model - Custom model name.
 * @returns {string|undefined} 'supported' | 'unsupported' | undefined (unknown).
 */
export function getCustomResponseFormatSupport(apiUrl, model) {
  const cacheKey = normalizeCustomResponseFormatCacheKey(apiUrl, model);
  return cacheKey ? customResponseFormatSupportCache.get(cacheKey) : undefined;
}

/**
 * Writes the cached capability for an endpoint. Inconclusive outcomes must
 * not call this; prior entries are retained (never deleted here).
 * @param {string} apiUrl - Custom endpoint URL.
 * @param {string} model - Custom model name.
 * @param {string} support - 'supported' | 'unsupported'.
 * @returns {boolean} True when written, false when key/value invalid.
 */
export function setCustomResponseFormatSupport(apiUrl, model, support) {
  if (
    support !== CUSTOM_RESPONSE_FORMAT_SUPPORT.SUPPORTED &&
    support !== CUSTOM_RESPONSE_FORMAT_SUPPORT.UNSUPPORTED
  ) {
    return false;
  }
  const cacheKey = normalizeCustomResponseFormatCacheKey(apiUrl, model);
  if (!cacheKey) return false;
  customResponseFormatSupportCache.set(cacheKey, support);
  return true;
}

/**
 * Clears the runtime response_format capability cache. Intended for tests.
 */
export function clearCustomResponseFormatSupportCache() {
  customResponseFormatSupportCache.clear();
}

/**
 * Classifies only explicit response_format rejections: status 400/422 AND a
 * message specifically identifying the response_format field/path as
 * invalid/rejected/unsupported. Unrelated 400s and non-400/422 statuses
 * never match, even when they mention response_format.
 * @param {Error} error - Transport error with statusCode and message.
 * @returns {boolean}
 */
export function isUnsupportedResponseFormatError(error) {
  const statusCode = Number(error?.statusCode);
  if (statusCode !== 400 && statusCode !== 422) return false;

  const message = typeof error?.message === 'string' ? error.message : '';
  return UNSUPPORTED_RESPONSE_FORMAT_PATTERNS.some((pattern) => pattern.test(message));
}
