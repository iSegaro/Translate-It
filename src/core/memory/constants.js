/**
 * Environment detection for browser extension contexts
 */
const IS_CONTENT_SCRIPT = typeof window !== 'undefined' &&
                         typeof chrome !== 'undefined' &&
                         chrome.runtime &&
                         !chrome.extension?.getBackgroundPage

/**
 * Build environment detection
 */
const IS_DEVELOPMENT = import.meta.env.DEV || process.env.NODE_ENV === 'development'

/**
 * Device memory detection with fallback
 */
const getDeviceMemory = () => {
  if (typeof navigator !== 'undefined' && navigator.deviceMemory) {
    return navigator.deviceMemory
  }
  return 4 // Default assumption: 4GB
}

/**
 * Memory Management Timing Constants
 * Centralized timing configuration for the memory management system
 * This ensures consistency across all memory-related components
 */

export const MEMORY_TIMING = {
  // Cache cleanup intervals
  CACHE_CLEANUP_INTERVAL: 10 * 60 * 1000,       // 10 minutes - general cache cleanup (optimized for production)

  // Garbage collection intervals
  GC_INTERVAL: 10 * 60 * 1000,                  // 10 minutes - periodic garbage collection (optimized for production)

  // Central timer intervals
  CENTRAL_TIMER_INTERVAL: 5 * 60 * 1000,        // 5 minutes - central memory manager timer (reduced from 1min)

  // Memory monitoring intervals - dynamic based on environment
  MEMORY_MONITOR_INTERVAL: IS_DEVELOPMENT
    ? 60 * 1000                                  // 60 seconds - development
    : 5 * 60 * 1000,                             // 5 minutes - production (reduced from 2min)

  // Cache TTL (Time To Live) settings - extended for better performance
  CACHE_DEFAULT_TTL: 60 * 60 * 1000,            // 1 hour - default cache expiration (extended from 30min)
  CRITICAL_CACHE_TTL: 2 * 60 * 60 * 1000,       // 2 hours - critical cache expiration (extended from 1hour)

  // Memory monitoring thresholds (in bytes) - environment-aware
  MEMORY_WARNING_THRESHOLD: IS_CONTENT_SCRIPT
    ? 150 * 1024 * 1024                          // 150MB - content script (lower for shared tab memory)
    : 200 * 1024 * 1024,                         // 200MB - service worker
  MEMORY_CRITICAL_THRESHOLD: IS_CONTENT_SCRIPT
    ? 300 * 1024 * 1024                          // 300MB - content script
    : 400 * 1024 * 1024,                         // 400MB - service worker

  // Resource tracking limits - device memory aware
  MAX_CACHE_SIZE: getDeviceMemory() > 4 ? 200 : 100,    // Adaptive based on device memory
  MAX_HISTORY_SIZE: 1000,                       // Maximum history entries

  // Emergency cleanup settings
  EMERGENCY_CLEANUP_DELAY: 5 * 1000,            // 5 seconds - delay before emergency cleanup
  CLEANUP_BATCH_SIZE: 50,                       // Number of items to cleanup in one batch
}

/**
 * Memory component identifiers for debugging and logging
 */
export const MEMORY_COMPONENTS = {
  MEMORY_MANAGER: 'memory-manager',
  SMART_CACHE: 'smart-cache', 
  GLOBAL_CLEANUP: 'global-cleanup',
  MEMORY_MONITOR: 'memory-monitor',
  RESOURCE_TRACKER: 'resource-tracker',
  STORAGE_CORE: 'storage-core',
}

/**
 * Translation-aware memory management settings
 */
export const TRANSLATION_MEMORY = {
  // Skip cleanup during translation
  SKIP_CLEANUP_DURING_TRANSLATION: true,
  
  // Grace period after translation completion
  POST_TRANSLATION_GRACE_PERIOD: 30 * 1000,    // 30 seconds
  
  // Maximum translation tracking time
  MAX_TRANSLATION_DURATION: 5 * 60 * 1000,     // 5 minutes
}