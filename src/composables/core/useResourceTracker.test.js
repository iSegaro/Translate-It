/**
 * Vue Resource Tracker Composable - Unit Tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getMemoryManager } from '../../core/memory/MemoryManager'

describe('useResourceTracker', () => {
  let memoryManager

  beforeEach(() => {
    // Reset singleton instances
    memoryManager = getMemoryManager({ enableMonitoring: false })
  })

  afterEach(() => {
    // Cleanup after each test
    memoryManager.cleanupAll()
  })

  it('should work with memory manager', () => {
    const stats = memoryManager.getMemoryStats()
    expect(stats).toBeDefined()
    expect(typeof stats.activeResources).toBe('number')
  })

  it('should support centralized cleanup system', () => {
    expect(memoryManager.registeredCaches).toBeDefined()
    expect(memoryManager.registeredMonitors).toBeDefined()
    expect(typeof memoryManager.registerCache).toBe('function')
    expect(typeof memoryManager.registerMonitor).toBe('function')
  })

  it('should handle environment-based configuration', () => {
    const devManager = getMemoryManager({ enableMonitoring: true })
    expect(devManager.isDevelopment).toBe(true)

    const prodManager = getMemoryManager({ enableMonitoring: false })
    expect(prodManager.isDevelopment).toBe(false)
  })
})
