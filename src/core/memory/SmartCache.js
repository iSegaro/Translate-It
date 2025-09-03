/**
 * Memory Garbage Collector - Smart Cache System
 * Cache with TTL, size limits, and automatic cleanup
 */
class SmartCache extends Map {
  constructor(options = {}) {
    super()
    this.maxSize = options.maxSize || 100
    this.defaultTTL = options.defaultTTL || 30 * 60 * 1000 // 30 minutes
    this.accessTimes = new Map()
    this.expiryTimes = new Map()
    this.cleanupInterval = null
    this.isDestroyed = false

    // Start cleanup interval
    this.startCleanupInterval()
  }

  /**
   * Set a value with optional TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   * @returns {SmartCache} This cache instance
   */
  set(key, value, ttl = this.defaultTTL) {
    if (this.isDestroyed) {
      throw new Error('Cache is destroyed')
    }

    // Check size limit
    if (this.size >= this.maxSize && !this.has(key)) {
      this.evictLRU()
    }

    // Set value with TTL
    super.set(key, value)
    this.accessTimes.set(key, Date.now())
    this.expiryTimes.set(key, Date.now() + ttl)

    return this
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    if (this.isDestroyed) {
      return undefined
    }

    // Check expiry
    if (this.isExpired(key)) {
      this.delete(key)
      return undefined
    }

    // Update access time for LRU
    this.accessTimes.set(key, Date.now())
    return super.get(key)
  }

  /**
   * Check if a key is expired
   * @param {string} key - Cache key
   * @returns {boolean} True if expired
   */
  isExpired(key) {
    const expiryTime = this.expiryTimes.get(key)
    return expiryTime && Date.now() > expiryTime
  }

  /**
   * Evict least recently used item
   */
  evictLRU() {
    if (this.size === 0) return

    let lruKey = null
    let lruTime = Date.now()

    for (const [key, accessTime] of this.accessTimes) {
      if (accessTime < lruTime) {
        lruTime = accessTime
        lruKey = key
      }
    }

    if (lruKey) {
      this.delete(lruKey)
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    if (this.isDestroyed) return

    const now = Date.now()
    const keysToDelete = []

    for (const [key, expiryTime] of this.expiryTimes) {
      if (now > expiryTime) {
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => this.delete(key))
  }

  /**
   * Delete a key and clean up metadata
   * @param {string} key - Cache key
   * @returns {boolean} True if key existed
   */
  delete(key) {
    const existed = super.delete(key)
    if (existed) {
      this.accessTimes.delete(key)
      this.expiryTimes.delete(key)
    }
    return existed
  }

  /**
   * Clear all cache entries
   */
  clear() {
    super.clear()
    this.accessTimes.clear()
    this.expiryTimes.clear()
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const now = Date.now()
    let expiredCount = 0
    let totalTTL = 0

    for (const [key, expiryTime] of this.expiryTimes) {
      if (now > expiryTime) {
        expiredCount++
      } else {
        totalTTL += expiryTime - now
      }
    }

    return {
      size: this.size,
      maxSize: this.maxSize,
      expiredCount,
      averageTTL: this.size > 0 ? totalTTL / this.size : 0,
      hitRate: this.calculateHitRate()
    }
  }

  /**
   * Calculate cache hit rate (simplified)
   * @returns {number} Hit rate percentage
   */
  calculateHitRate() {
    // This is a simplified calculation
    // In a real implementation, you'd track hits/misses
    const totalEntries = this.size
    const expiredEntries = Array.from(this.expiryTimes.values())
      .filter(expiry => Date.now() > expiry).length

    return totalEntries > 0 ? ((totalEntries - expiredEntries) / totalEntries) * 100 : 0
  }

  /**
   * Start the cleanup interval
   */
  startCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000)
  }

  /**
   * Stop the cleanup interval
   */
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Destroy the cache and clean up resources
   */
  destroy() {
    if (this.isDestroyed) return

    this.stopCleanupInterval()
    this.clear()
    this.isDestroyed = true
  }

  /**
   * Get all valid (non-expired) entries
   * @returns {Array} Array of [key, value] pairs
   */
  getValidEntries() {
    const validEntries = []
    for (const [key, value] of this) {
      if (!this.isExpired(key)) {
        validEntries.push([key, value])
      }
    }
    return validEntries
  }

  /**
   * Refresh TTL for a key
   * @param {string} key - Cache key
   * @param {number} ttl - New TTL
   */
  refresh(key, ttl = this.defaultTTL) {
    if (this.has(key) && !this.isExpired(key)) {
      this.expiryTimes.set(key, Date.now() + ttl)
      this.accessTimes.set(key, Date.now())
    }
  }

  /**
   * Check if cache has a valid (non-expired) key
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is valid
   */
  hasValid(key) {
    return this.has(key) && !this.isExpired(key)
  }
}

export default SmartCache
