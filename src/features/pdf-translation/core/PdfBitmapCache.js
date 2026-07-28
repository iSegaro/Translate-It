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

  tryAdmit(key, bitmap, estimatedBytes) {
    if (!this._isAdmissible(key, bitmap, estimatedBytes)) {
      return false
    }

    if (this._entries.has(key)) {
      this._removeEntry(key)
    }

    this._entries.set(key, { bitmap, size: estimatedBytes })
    this._currentSizeBytes += estimatedBytes
    this._evict()
    return true
  }

  /**
   * @deprecated Temporary compatibility wrapper.
   * Use tryAdmit() directly.
   */
  set(key, bitmap, metadata = {}) {
    const width = metadata.width || bitmap?.width || 0
    const height = metadata.height || bitmap?.height || 0
    const estimatedBytes = estimateEntrySize(width, height)
    return this.tryAdmit(key, bitmap, estimatedBytes)
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
    for (const key of [...this._entries.keys()]) {
      this._removeEntry(key)
    }
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

    this._currentSizeBytes -= entry.size
    this._entries.delete(key)
    this._closeBitmap(entry.bitmap)
  }

  _isAdmissible(key, bitmap, estimatedBytes) {
    if (typeof key !== 'string' || !key || !bitmap || typeof bitmap.close !== 'function') {
      return false
    }

    if (!Number.isSafeInteger(estimatedBytes) || estimatedBytes <= 0 || estimatedBytes > this._maxSizeBytes) {
      return false
    }

    return ![...this._entries.values()].some((entry) => entry.bitmap === bitmap)
  }

  _closeBitmap(bitmap) {
    try {
      bitmap.close?.()
    } catch (error) {
      logger.warn('[BitmapCache] failed to close bitmap', { error })
    }
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
