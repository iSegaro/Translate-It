/**
 * Memory Garbage Collector - Integration Test
 * Simple test to verify the system works correctly
 */

import { getMemoryManager } from './MemoryManager.js'
import { getGlobalCleanup } from './GlobalCleanup.js'
import { getMemoryMonitor } from './MemoryMonitor.js'
import ResourceTracker from './ResourceTracker.js'
import SmartCache from './SmartCache.js'

console.log('🧪 Memory Garbage Collector - Integration Test Started')

// Test MemoryManager
const manager = getMemoryManager()
console.log('✅ MemoryManager initialized:', manager.getMemoryStats())

// Test ResourceTracker
class TestClass extends ResourceTracker {
  constructor() {
    super('test-class')
    console.log('✅ TestClass created with ResourceTracker')

    // Test timer tracking
    this.testTimer = this.trackTimeout(() => {
      console.log('✅ Tracked timeout executed')
    }, 1000)

    // Test cache tracking
    this.testCache = new SmartCache({ maxSize: 10, defaultTTL: 5000 })
    this.trackCache(this.testCache)
  }

  destroy() {
    this.testCache.destroy()
    super.destroy()
    console.log('✅ TestClass destroyed')
  }
}

const testInstance = new TestClass()

// Test SmartCache
const cache = new SmartCache({ maxSize: 5, defaultTTL: 2000 })
cache.set('test1', 'value1')
cache.set('test2', 'value2')
console.log('✅ SmartCache created and populated:', cache.getStats())

// Test GlobalCleanup
const cleanup = getGlobalCleanup()
cleanup.initialize()
console.log('✅ GlobalCleanup initialized:', cleanup.getStats())

// Test MemoryMonitor
const monitor = getMemoryMonitor()
monitor.startMonitoring()
console.log('✅ MemoryMonitor started:', monitor.getStats())

// Test cleanup
setTimeout(() => {
  console.log('🧹 Testing cleanup...')

  // Cleanup test instance
  testInstance.destroy()

  // Perform garbage collection
  manager.performGarbageCollection()

  // Generate report
  const report = manager.generateReport()
  console.log('📊 Final memory report:', report)

  console.log('✅ Memory Garbage Collector - Integration Test Completed')
}, 2000)
