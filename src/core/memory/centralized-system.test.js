/**
 * Centralized Memory Management System - Integration Tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getMemoryManager } from '@/core/memory/MemoryManager'
import { getMemoryMonitor } from '@/core/memory/MemoryMonitor'
import { getGlobalCleanup } from '@/core/memory/GlobalCleanup'
import SmartCache from '@/core/memory/SmartCache'

describe('Centralized Memory Management System', () => {
  let memoryManager
  let monitor
  let cleanup

  beforeEach(() => {
    // Initialize with centralized system enabled
    memoryManager = getMemoryManager({
      enableMonitoring: false, // Disable for testing
      centralTimerInterval: 1000 // Fast interval for testing
    })

    monitor = getMemoryMonitor({
      useCentralMonitoring: true
    })

    cleanup = getGlobalCleanup({
      useCentralGC: true
    })
  })

  afterEach(() => {
    // Cleanup
    memoryManager.cleanupAll()
    memoryManager.stopCentralTimer()
  })

  it('should initialize centralized timer system', () => {
    expect(memoryManager.centralTimer).toBeDefined()
    expect(memoryManager.registeredCaches.size).toBe(0)
    expect(memoryManager.registeredMonitors.size).toBe(0)
  })

  it('should register and unregister caches', () => {
    const cache = new SmartCache({
      useCentralCleanup: true,
      maxSize: 10
    })

    expect(memoryManager.registeredCaches.has(cache)).toBe(true)

    cache.destroy()
    expect(memoryManager.registeredCaches.has(cache)).toBe(false)
  })

  it('should register and unregister monitors', () => {
    expect(memoryManager.registeredMonitors.has(monitor)).toBe(true)

    monitor.stopMonitoring()
    expect(memoryManager.registeredMonitors.has(monitor)).toBe(false)
  })

  it('should perform centralized cleanup', async () => {
    const cache = new SmartCache({
      useCentralCleanup: true,
      maxSize: 10,
      defaultTTL: 100 // Short TTL for testing
    })

    // Add some data to cache
    cache.set('test1', 'value1')
    cache.set('test2', 'value2')

    expect(cache.size).toBe(2)

    // Wait for centralized cleanup
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Cache should be cleaned up by centralized system
    expect(cache.size).toBe(0)
  })

  it('should handle monitor registration', () => {
    monitor.startMonitoring()

    // Monitor should be registered
    expect(memoryManager.registeredMonitors.has(monitor)).toBe(true)

    // Simulate monitoring call
    const performMonitoringSpy = vi.spyOn(monitor, 'performMonitoring')
    memoryManager.performCentralCleanup()

    expect(performMonitoringSpy).toHaveBeenCalled()

    monitor.stopMonitoring()
  })

  it('should work in development mode', () => {
    // Mock development environment
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const devManager = getMemoryManager()

    expect(devManager.isDevelopment).toBe(true)
    expect(devManager.centralTimer).toBeDefined()

    // Restore
    process.env.NODE_ENV = originalEnv
  })

  it('should work in production mode', () => {
    // Mock production environment
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    const prodManager = getMemoryManager()

    expect(prodManager.isDevelopment).toBe(false)
    expect(prodManager.centralTimer).toBeNull()

    // Restore
    process.env.NODE_ENV = originalEnv
  })

  it('should handle multiple caches efficiently', () => {
    const caches = []

    // Create multiple caches
    for (let i = 0; i < 5; i++) {
      const cache = new SmartCache({
        useCentralCleanup: true,
        maxSize: 10
      })
      caches.push(cache)
    }

    expect(memoryManager.registeredCaches.size).toBe(5)

    // All caches should be cleaned up efficiently by centralized system
    caches.forEach(cache => cache.destroy())

    expect(memoryManager.registeredCaches.size).toBe(0)
  })
})
