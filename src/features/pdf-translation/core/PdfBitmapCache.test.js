import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PdfBitmapCache } = await import('./PdfBitmapCache.js')

function createMockBitmap(width = 10, height = 10) {
  return { width, height, close: vi.fn() }
}

function estimateBytes(bitmap) {
  return bitmap.width * bitmap.height * 4
}

function admit(cache, key, bitmap) {
  return cache.tryAdmit(key, bitmap, estimateBytes(bitmap))
}

describe('PdfBitmapCache', () => {
  let cache

  beforeEach(() => {
    cache = new PdfBitmapCache({ maxSizeBytes: 1_000 })
  })

  it('builds a key from document identity, page number, and scale', () => {
    expect(PdfBitmapCache.buildKey('doc-fingerprint', 3, 1.5)).toBe('doc-fingerprint:3:1.5')
  })

  it('transfers ownership only after successful admission', () => {
    const bitmap = createMockBitmap()

    expect(admit(cache, 'key', bitmap)).toBe(true)
    expect(cache.get('key')).toBe(bitmap)
    expect(cache.currentSizeBytes).toBe(400)
    expect(bitmap.close).not.toHaveBeenCalled()
  })

  it('rejects oversized candidates without insertion, eviction, or closure', () => {
    const retained = createMockBitmap(10, 10)
    const oversized = createMockBitmap(20, 20)
    admit(cache, 'retained', retained)

    expect(admit(cache, 'oversized', oversized)).toBe(false)
    expect(cache.size).toBe(1)
    expect(cache.get('retained')).toBe(retained)
    expect(cache.currentSizeBytes).toBe(400)
    expect(retained.close).not.toHaveBeenCalled()
    expect(oversized.close).not.toHaveBeenCalled()
  })

  it.each([
    ['', createMockBitmap(), 400],
    ['key', null, 400],
    ['key', createMockBitmap(), 0],
    ['key', createMockBitmap(), Number.NaN]
  ])('rejects invalid admission without side effects', (key, bitmap, estimatedBytes) => {
    const retained = createMockBitmap()
    admit(cache, 'retained', retained)

    expect(cache.tryAdmit(key, bitmap, estimatedBytes)).toBe(false)
    expect(cache.size).toBe(1)
    expect(cache.currentSizeBytes).toBe(400)
    expect(retained.close).not.toHaveBeenCalled()
    if (bitmap?.close) {
      expect(bitmap.close).not.toHaveBeenCalled()
    }
  })

  it('leaves rejected candidates for the caller to close exactly once', () => {
    const bitmap = createMockBitmap(20, 20)

    const accepted = admit(cache, 'oversized', bitmap)
    if (!accepted) bitmap.close()

    expect(bitmap.close).toHaveBeenCalledTimes(1)
    expect(cache.size).toBe(0)
  })

  it('forwards set admission without taking rejected bitmap ownership', () => {
    const bitmap = createMockBitmap(20, 20)
    const admitSpy = vi.spyOn(cache, 'tryAdmit')

    expect(cache.set('oversized', bitmap)).toBe(false)
    expect(admitSpy).toHaveBeenCalledWith('oversized', bitmap, 1_600)
    expect(bitmap.close).not.toHaveBeenCalled()
    expect(cache.size).toBe(0)
  })

  it('evicts the least recently used owned bitmap', () => {
    const b1 = createMockBitmap()
    const b2 = createMockBitmap()
    const b3 = createMockBitmap()
    admit(cache, 'k1', b1)
    admit(cache, 'k2', b2)
    cache.get('k1')
    admit(cache, 'k3', b3)

    expect(cache.get('k2')).toBeNull()
    expect(cache.get('k1')).toBe(b1)
    expect(cache.get('k3')).toBe(b3)
    expect(b2.close).toHaveBeenCalledTimes(1)
  })

  it('replaces an owned bitmap and closes each bitmap once across clear', () => {
    const oldBitmap = createMockBitmap()
    const newBitmap = createMockBitmap()
    admit(cache, 'key', oldBitmap)

    expect(admit(cache, 'key', newBitmap)).toBe(true)
    expect(cache.get('key')).toBe(newBitmap)
    expect(cache.currentSizeBytes).toBe(400)
    expect(oldBitmap.close).toHaveBeenCalledTimes(1)
    expect(newBitmap.close).not.toHaveBeenCalled()

    cache.clear()

    expect(oldBitmap.close).toHaveBeenCalledTimes(1)
    expect(newBitmap.close).toHaveBeenCalledTimes(1)
    expect(cache.size).toBe(0)
    expect(cache.currentSizeBytes).toBe(0)
  })

  it('rejects an already owned bitmap without transferring it twice', () => {
    const bitmap = createMockBitmap()
    admit(cache, 'first', bitmap)

    expect(admit(cache, 'second', bitmap)).toBe(false)
    cache.clear()

    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('closes invalidated owned bitmaps and preserves other entries', () => {
    const b1 = createMockBitmap()
    const b2 = createMockBitmap()
    const b3 = createMockBitmap()
    admit(cache, 'doc:1:1', b1)
    admit(cache, 'doc:1:2', b2)
    admit(cache, 'doc:2:1', b3)

    cache.invalidatePage(1)

    expect(cache.size).toBe(1)
    expect(cache.get('doc:2:1')).toBe(b3)
    expect(b1.close).toHaveBeenCalledTimes(1)
    expect(b2.close).toHaveBeenCalledTimes(1)
  })

  it('continues clearing and deaccounting when bitmap closure throws', () => {
    const throwing = createMockBitmap()
    const retained = createMockBitmap()
    throwing.close.mockImplementation(() => { throw new Error('close failed') })
    admit(cache, 'throwing', throwing)
    admit(cache, 'retained', retained)

    expect(() => cache.clear()).not.toThrow()
    expect(throwing.close).toHaveBeenCalledTimes(1)
    expect(retained.close).toHaveBeenCalledTimes(1)
    expect(cache.size).toBe(0)
    expect(cache.currentSizeBytes).toBe(0)
  })

  it('keeps byte accounting correct across eviction and invalidation', () => {
    const smallCache = new PdfBitmapCache({ maxSizeBytes: 500 })
    const b1 = createMockBitmap()
    const b2 = createMockBitmap()
    admit(smallCache, 'doc:1:1', b1)
    admit(smallCache, 'doc:2:1', b2)

    expect(smallCache.currentSizeBytes).toBe(400)
    expect(b1.close).toHaveBeenCalledTimes(1)

    smallCache.invalidatePage(2)

    expect(smallCache.currentSizeBytes).toBe(0)
    expect(b2.close).toHaveBeenCalledTimes(1)
  })
})
