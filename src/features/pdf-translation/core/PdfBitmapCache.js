import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfBitmapCache')

const DEFAULT_MAX_SIZE_BYTES = 64 * 1024 * 1024 // 64 MB

/**
 * Estimate memory usage for a bitmap entry.
 *
 * @param {number} width - Bitmap width in pixels
 * @param {number} height - Bitmap height in pixels
 * @returns {number} Estimated bytes (4 bytes per pixel)
 */
function estimateEntrySize(width, height) {
  return width * height * 4
}

/**
 * LRU bitmap cache for rendered PDF pages.
 *
 * Stores ImageBitmap entries keyed by document identity, page number, and scale.
 * Evicts least recently used entries when memory limit is exceeded.
 *
 * Owns storage only — does not coordinate rendering or DOM operations.
 */
export class PdfBitmapCache {
  /**
   * @param {object} [options]
   * @param {number} [options.maxSizeBytes] - Maximum cache size in bytes (default 64 MB)
   */
  constructor({ maxSizeBytes = DEFAULT_MAX_SIZE_BYTES } = {}) {
    /** @type {Map<string, { bitmap: ImageBitmap, size: number }>} */
    this._entries = new Map()
    this._maxSizeBytes = maxSizeBytes
    this._currentSizeBytes = 0
  }

  /**
   * Build a cache key from document identity, page number, and scale.
   *
   * @param {string} documentIdentity
   * @param {number} pageNumber
   * @param {number} scale
   * @returns {string}
   */
  static buildKey(documentIdentity, pageNumber, scale) {
    return `${documentIdentity}:${pageNumber}:${scale}`
  }

  /**
   * Retrieve a cached bitmap. Moves entry to most-recently-used position.
   *
   * @param {string} key
   * @returns {ImageBitmap | null}
   */
  get(key) {
    const entry = this._entries.get(key)
    if (!entry) return null

    // Move to end (most recently used)
    this._entries.delete(key)
    this._entries.set(key, entry)

    return entry.bitmap
  }

  /**
   * Store a bitmap in the cache. Evicts LRU entries if over limit.
   *
   * @param {string} key
   * @param {ImageBitmap} bitmap
   * @param {object} [metadata]
   * @param {number} [metadata.width] - Bitmap width (for size estimation)
   * @param {number} [metadata.height] - Bitmap height (for size estimation)
   */
  set(key, bitmap, metadata = {}) {
    // Remove existing entry under same key if present
    if (this._entries.has(key)) {
      this._removeEntry(key)
    }

    const width = metadata.width || bitmap.width || 0
    const height = metadata.height || bitmap.height || 0
    const size = estimateEntrySize(width, height)

    this._entries.set(key, { bitmap, size })
    this._currentSizeBytes += size

    this._evict()
  }

  /**
   * Invalidate all entries for a specific page number across all documents/scales.
   *
   * @param {number} pageNumber
   */
  invalidatePage(pageNumber) {
    const keysToRemove = []
    for (const key of this._entries.keys()) {
      const parsed = PdfBitmapCache._parsePageNumberFromKey(key)
      if (parsed === pageNumber) {
        keysToRemove.push(key)
      }
    }

    for (const key of keysToRemove) {
      this._removeEntry(key)
    }
  }

  /**
   * Clear all entries and close their bitmaps.
   */
  clear() {
    for (const [, entry] of this._entries) {
      entry.bitmap.close?.()
    }
    this._entries.clear()
    this._currentSizeBytes = 0
  }

  /**
   * Number of entries in the cache.
   *
   * @returns {number}
   */
  get size() {
    return this._entries.size
  }

  /**
   * Current estimated memory usage in bytes.
   *
   * @returns {number}
   */
  get currentSizeBytes() {
    return this._currentSizeBytes
  }

  /**
   * Remove a single entry and close its bitmap.
   *
   * @param {string} key
   * @private
   */
  _removeEntry(key) {
    const entry = this._entries.get(key)
    if (!entry) return

    entry.bitmap.close?.()
    this._currentSizeBytes -= entry.size
    this._entries.delete(key)
  }

  /**
   * Evict least recently used entries until under the memory limit.
   *
   * @private
   */
  _evict() {
    while (this._currentSizeBytes > this._maxSizeBytes && this._entries.size > 0) {
      // Map preserves insertion order — first entry is least recently used
      const oldestKey = this._entries.keys().next().value
      logger.info('[BitmapCache] evicting LRU entry', {
        key: oldestKey,
        currentSize: this._currentSizeBytes,
        maxSize: this._maxSizeBytes
      })
      this._removeEntry(oldestKey)
    }
  }

  /**
   * Parse page number from a cache key.
   * Format: `${documentIdentity}:${pageNumber}:${scale}`
   *
   * @param {string} key
   * @returns {number | null}
   * @private
   */
  static _parsePageNumberFromKey(key) {
    // Find second colon — document identity may contain colons (e.g., blob URLs)
    const firstColon = key.indexOf(':')
    if (firstColon < 0) return null
    const secondColon = key.indexOf(':', firstColon + 1)
    if (secondColon < 0) return null
    const pageNumber = Number(key.slice(firstColon + 1, secondColon))
    return Number.isFinite(pageNumber) ? pageNumber : null
  }
}
