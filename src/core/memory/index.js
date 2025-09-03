/**
 * Memory Garbage Collector - Main Exports
 * Unified exports for the memory management system
 */

// Core Components
export { default as MemoryManager, getMemoryManager } from './MemoryManager.js'
export { default as ResourceTracker } from './ResourceTracker.js'
export { default as SmartCache } from './SmartCache.js'

// Lifecycle Management
export { default as GlobalCleanup, getGlobalCleanup, initializeGlobalCleanup } from './GlobalCleanup.js'

// Monitoring
export { default as MemoryMonitor, getMemoryMonitor, startMemoryMonitoring } from './MemoryMonitor.js'

// Debug utilities for development
export function getMemoryStats() {
  const manager = getMemoryManager()
  return manager.getMemoryStats()
}

export function generateMemoryReport() {
  const manager = getMemoryManager()
  return manager.generateReport()
}

export function performGarbageCollection() {
  const manager = getMemoryManager()
  return manager.performGarbageCollection()
}

export function detectMemoryLeaks() {
  const manager = getMemoryManager()
  return manager.detectMemoryLeaks()
}

// Development console commands (only in development)
if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
  window.memoryManager = {
    getStats: getMemoryStats,
    generateReport: generateMemoryReport,
    performGC: performGarbageCollection,
    detectLeaks: detectMemoryLeaks,
    getMonitor: () => getMemoryMonitor(),
    getCleanup: () => getGlobalCleanup()
  }
}
