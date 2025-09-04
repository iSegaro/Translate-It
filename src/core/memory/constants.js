/**
 * Memory Management Timing Constants
 * Centralized timing configuration for the memory management system
 * This ensures consistency across all memory-related components
 */

export const MEMORY_TIMING = {
  // Cache cleanup intervals
  CACHE_CLEANUP_INTERVAL: 5 * 60 * 1000,        // 5 minutes - general cache cleanup
  
  // Garbage collection intervals
  GC_INTERVAL: 5 * 60 * 1000,                   // 5 minutes - periodic garbage collection
  
  // Central timer intervals
  CENTRAL_TIMER_INTERVAL: 60 * 1000,            // 1 minute - central memory manager timer
  
  // Memory monitoring intervals
  MEMORY_MONITOR_INTERVAL: 60 * 1000,           // 60 seconds - memory usage monitoring
  
  // Cache TTL (Time To Live) settings
  CACHE_DEFAULT_TTL: 30 * 60 * 1000,            // 30 minutes - default cache expiration
  CRITICAL_CACHE_TTL: 60 * 60 * 1000,           // 1 hour - critical cache expiration (storage, config)
  
  // Memory monitoring thresholds (in bytes) - realistic for browser extensions
  MEMORY_WARNING_THRESHOLD: 200 * 1024 * 1024,  // 200MB - warning threshold (realistic for extensions)
  MEMORY_CRITICAL_THRESHOLD: 400 * 1024 * 1024, // 400MB - critical threshold (aggressive cleanup needed)
  
  // Resource tracking limits
  MAX_CACHE_SIZE: 200,                          // Maximum cache entries
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