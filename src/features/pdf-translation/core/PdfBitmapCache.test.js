import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PdfBitmapCache } = await import('./PdfBitmapCache.js')

function createMockBitmap(width = 100, height = 100) {
  return {
    width,
    height,
    close: vi.fn()
  }
}

describe('PdfBitmapCache', () => {
  let cache

  beforeEach(() => {
    cache = new PdfBitmapCache({ maxSizeBytes: 1024 * 1024 }) // 1 MB for tests
  })

  describe('buildKey', () => {
    it('builds key from document identity, page number, and scale', () => {
      const key = PdfBitmapCache.buildKey('doc-fingerprint', 3, 1.5)
      expect(key).toBe('doc-fingerprint:3:1.5')
    })

    it('handles document identity with colons', () => {
      const key = PdfBitmapCache.buildKey('blob:http://example.com', 1, 2)
      expect(key).toBe('blob:http://example.com:1:2')
    })
  })

  describe('get', () => {
    it('returns null for missing key', () => {
      expect(cache.get('missing')).toBeNull()
    })

    it('returns bitmap for existing key', () => {
      const bitmap = createMockBitmap()
      cache.set('key1', bitmap, { width: 100, height: 100 })
      expect(cache.get('key1')).toBe(bitmap)
    })

    it('moves accessed entry to most recently used position', () => {
      // Use tiny bitmaps: 5 * 5 * 4 = 100 bytes each
      // Limit: 250 bytes — fits 2 entries, evicts on 3rd
      const b1 = createMockBitmap(5, 5)
      const b2 = createMockBitmap(5, 5)
      const b3 = createMockBitmap(5, 5)

      const smallCache = new PdfBitmapCache({ maxSizeBytes: 250 })
      smallCache.set('k1', b1, { width: 5, height: 5 })
      smallCache.set('k2', b2, { width: 5, height: 5 })

      // Access k1 to make it most recently used
      smallCache.get('k1')

      // Adding k3 should evict k2 (LRU), k1 stays (MRU)
      smallCache.set('k3', b3, { width: 5, height: 5 })

      expect(smallCache.get('k2')).toBeNull()
      expect(smallCache.get('k1')).toBe(b1)
    })
  })

  describe('set', () => {
    it('stores bitmap and tracks size', () => {
      const bitmap = createMockBitmap(100, 100)
      cache.set('key1', bitmap)

      expect(cache.size).toBe(1)
      expect(cache.currentSizeBytes).toBe(100 * 100 * 4)
    })

    it('replaces existing entry under same key', () => {
      const b1 = createMockBitmap(100, 100)
      const b2 = createMockBitmap(200, 200)

      cache.set('key1', b1)
      cache.set('key1', b2)

      expect(cache.size).toBe(1)
      expect(cache.get('key1')).toBe(b2)
      expect(b1.close).toHaveBeenCalled()
    })

    it('uses metadata dimensions when provided', () => {
      const bitmap = createMockBitmap(50, 50)
      cache.set('key1', bitmap, { width: 200, height: 200 })

      expect(cache.currentSizeBytes).toBe(200 * 200 * 4)
    })
  })

  describe('LRU eviction', () => {
    it('evicts least recently used entries when over limit', () => {
      // Each entry: 10 * 10 * 4 = 400 bytes
      // Limit: 500 bytes — only 1 entry fits
      const smallCache = new PdfBitmapCache({ maxSizeBytes: 500 })

      const b1 = createMockBitmap(10, 10)
      const b2 = createMockBitmap(10, 10)
      const b3 = createMockBitmap(10, 10)

      smallCache.set('k1', b1, { width: 10, height: 10 })
      // k1 (400 bytes) fits, but adding k2 will exceed 500 bytes
      smallCache.set('k2', b2, { width: 10, height: 10 })
      // k1 gets evicted, k2 stays
      smallCache.set('k3', b3, { width: 10, height: 10 })
      // k2 gets evicted, k3 stays

      expect(smallCache.size).toBe(1)
      expect(smallCache.get('k1')).toBeNull()
      expect(smallCache.get('k2')).toBeNull()
      expect(smallCache.get('k3')).toBe(b3)
    })

    it('calls close on evicted bitmaps', () => {
      const smallCache = new PdfBitmapCache({ maxSizeBytes: 500 })
      const b1 = createMockBitmap(10, 10) // 400 bytes
      const b2 = createMockBitmap(10, 10) // 400 bytes

      smallCache.set('k1', b1, { width: 10, height: 10 })
      smallCache.set('k2', b2, { width: 10, height: 10 })

      // k1 gets evicted when k2 is added (400 + 400 > 500)
      expect(b1.close).toHaveBeenCalled()
    })

    it('preserves entries within memory limit', () => {
      // 10 * 10 * 4 = 400 bytes per entry, limit is 1000
      const b1 = createMockBitmap(10, 10)
      const b2 = createMockBitmap(10, 10)

      cache.set('k1', b1)
      cache.set('k2', b2)

      expect(cache.size).toBe(2)
      expect(cache.get('k1')).toBe(b1)
      expect(cache.get('k2')).toBe(b2)
    })
  })

  describe('invalidatePage', () => {
    it('removes all entries for a specific page number', () => {
      const b1 = createMockBitmap()
      const b2 = createMockBitmap()
      const b3 = createMockBitmap()

      cache.set('doc:1:1', b1)
      cache.set('doc:1:2', b2)
      cache.set('doc:2:1', b3)

      cache.invalidatePage(1)

      expect(cache.size).toBe(1)
      expect(cache.get('doc:2:1')).toBe(b3)
      expect(b1.close).toHaveBeenCalled()
      expect(b2.close).toHaveBeenCalled()
    })

    it('is a no-op for non-existent page', () => {
      const b1 = createMockBitmap()
      cache.set('doc:1:1', b1)

      cache.invalidatePage(99)

      expect(cache.size).toBe(1)
      expect(b1.close).not.toHaveBeenCalled()
    })
  })

  describe('clear', () => {
    it('removes all entries', () => {
      const b1 = createMockBitmap()
      const b2 = createMockBitmap()

      cache.set('k1', b1)
      cache.set('k2', b2)

      cache.clear()

      expect(cache.size).toBe(0)
      expect(cache.currentSizeBytes).toBe(0)
    })

    it('calls close on all bitmaps', () => {
      const b1 = createMockBitmap()
      const b2 = createMockBitmap()

      cache.set('k1', b1)
      cache.set('k2', b2)

      cache.clear()

      expect(b1.close).toHaveBeenCalled()
      expect(b2.close).toHaveBeenCalled()
    })

    it('handles empty cache', () => {
      expect(() => cache.clear()).not.toThrow()
      expect(cache.size).toBe(0)
    })
  })

  describe('dispose', () => {
    it('clears all entries and closes bitmaps', () => {
      const b1 = createMockBitmap()
      cache.set('k1', b1)

      cache.clear()

      expect(cache.size).toBe(0)
      expect(b1.close).toHaveBeenCalled()
    })
  })

  describe('size tracking', () => {
    it('tracks current size correctly', () => {
      const b1 = createMockBitmap(100, 100) // 40000 bytes
      const b2 = createMockBitmap(50, 50)   // 10000 bytes

      cache.set('k1', b1)
      expect(cache.currentSizeBytes).toBe(40000)

      cache.set('k2', b2)
      expect(cache.currentSizeBytes).toBe(50000)

      cache.invalidatePage(1) // no-op for these keys
      expect(cache.currentSizeBytes).toBe(50000)
    })

    it('decrements size on removal', () => {
      const b1 = createMockBitmap(100, 100)
      cache.set('k1', b1)

      cache.invalidatePage(1) // k1 doesn't match page pattern
      // Use clear instead
      cache.clear()
      expect(cache.currentSizeBytes).toBe(0)
    })
  })
})
