/**
 * Memory Garbage Collector - Memory Monitor
 * Monitors memory usage and detects potential leaks
 */
import { getMemoryManager } from './MemoryManager.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { MEMORY_TIMING } from './constants.js'

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'MemoryMonitor')

class MemoryMonitor {
  constructor(options = {}) {
    if (!import.meta.env.DEV) {
      this.isMonitoring = false;
      return; // No-op in production
    }
    this.memoryManager = getMemoryManager()
    this.measurements = []
    this.thresholds = {
      warning: MEMORY_TIMING.MEMORY_WARNING_THRESHOLD,
      critical: MEMORY_TIMING.MEMORY_CRITICAL_THRESHOLD
    }
    this.logThresholds = {
      warning: this.thresholds.warning * 2, // 100MB for logging
      critical: this.thresholds.critical * 2 // 200MB for logging
    }
    this.monitorInterval = null
    this.isMonitoring = false
    this.useCentralMonitoring = options.useCentralMonitoring !== false

    // Register with centralized monitoring if enabled
    if (this.useCentralMonitoring) {
      this.memoryManager.registerMonitor(this)
    }
  }

  /**
   * Start memory monitoring
   */
  startMonitoring() {
    if (!import.meta.env.DEV) return;
    if (this.isMonitoring) return

    logger.init('Memory monitoring started')
    this.isMonitoring = true

    // Only start individual monitoring if not using centralized system
    if (!this.useCentralMonitoring) {
      this.monitorInterval = setInterval(() => {
        this.performMonitoring()
      }, MEMORY_TIMING.MEMORY_MONITOR_INTERVAL)

      // Track the monitor interval
      this.memoryManager.trackTimer(this.monitorInterval, 'memory-monitor')
    }
  }

  /**
   * Perform monitoring tasks (called by centralized system or individual timer)
   */
  performMonitoring() {
    if (!import.meta.env.DEV) return;
    try {
      this.measureMemory()
      this.checkThresholds()
      this.detectLeaks()
      this.monitorEventListeners()
    } catch (error) {
      logger.warn('Error during monitoring:', error)
    }
  }

  /**
   * Monitor event listeners for potential leaks
   */
  monitorEventListeners() {
    if (!import.meta.env.DEV) return;
    const eventReport = this.memoryManager.getEventListenerReport()

    // Log summary every 5 minutes (every 10th check since we check every 30s)
    if (!this.eventCheckCount) this.eventCheckCount = 0
    this.eventCheckCount++

    if (this.eventCheckCount % 10 === 0) {
      logger.debug(`Event listener summary: ${eventReport.totalElements} elements, ${eventReport.totalEvents} events, ${eventReport.totalListeners} listeners`)
    }

    // Check for potential leaks
    if (eventReport.potentialLeaks.length > 0) {
      logger.warn(`Potential event listener leaks detected:`, eventReport.potentialLeaks)

      // Auto-cleanup for critical cases
      const criticalEvents = ['scroll', 'resize', 'mousemove', 'touchmove']
      eventReport.potentialLeaks.forEach(leak => {
        if (criticalEvents.includes(leak.event) && leak.count > 20) {
          logger.warn(`Auto-cleaning up excessive ${leak.event} listeners: ${leak.count}`)
          const cleanupCount = this.memoryManager.cleanupEventListeners(leak.event)
          logger.info(`Auto-cleaned up ${cleanupCount} ${leak.event} listeners`)
        }
      })
    }
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (!import.meta.env.DEV) return;
    if (!this.isMonitoring) return

    // Unregister from centralized monitoring
    if (this.useCentralMonitoring) {
      this.memoryManager.unregisterMonitor(this)
    }

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = null
    }

    this.memoryManager.cleanupGroup('memory-monitor')
    this.isMonitoring = false
    logger.debug('Memory monitoring stopped')
  }

  /**
   * Measure current memory usage
   * @returns {Object|null} Memory measurement or null if not available
   */
  measureMemory() {
    if (!import.meta.env.DEV) return null;
    if (!performance.memory) {
      logger.debug('Performance.memory API not available')
      return null
    }

    const measurement = {
      timestamp: Date.now(),
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit
    }

    this.measurements.push(measurement)

    // Keep only last 100 measurements
    if (this.measurements.length > 100) {
      this.measurements.shift()
    }

    logger.debug(`Memory measurement: ${(measurement.used / 1024 / 1024).toFixed(2)}MB used`)
    return measurement
  }

  /**
   * Get current memory usage
   * @returns {number} Current memory usage in bytes
   */
  getCurrentMemory() {
    if (!import.meta.env.DEV) return 0;
    if (!performance.memory) return 0
    return performance.memory.usedJSHeapSize
  }

  /**
   * Check memory thresholds and trigger actions
   */
  checkThresholds() {
    if (!import.meta.env.DEV) return;
    const current = this.getCurrentMemory()

    // Log warnings at double thresholds
    if (current > this.logThresholds.critical) {
      logger.error(`Critical memory usage: ${(current / 1024 / 1024).toFixed(2)}MB`)
    } else if (current > this.logThresholds.warning) {
      logger.warn(`High memory usage: ${(current / 1024 / 1024).toFixed(2)}MB`)
    }

    // Cleanup actions at original thresholds
    if (current > this.thresholds.critical) {
      this.handleCriticalMemory()
    } else if (current > this.thresholds.warning) {
      this.handleWarningMemory()
    }
  }

  /**
   * Handle critical memory usage with enhanced event listener cleanup
   */
  handleCriticalMemory() {
    if (!import.meta.env.DEV) return;
    logger.error('Critical memory usage detected, performing emergency cleanup')

    // Log current memory stats before cleanup
    const beforeStats = this.memoryManager.getMemoryStats()
    logger.info(`Memory stats before cleanup:`, beforeStats)

    // Enhanced cleanup: prioritize event listeners
    const eventReport = this.memoryManager.getEventListenerReport()
    logger.info(`Event listener report:`, eventReport)

    // Clean up high-risk event listeners first
    if (eventReport.potentialLeaks.length > 0) {
      logger.warn(`Cleaning up ${eventReport.potentialLeaks.length} potential event listener leaks`)
      eventReport.potentialLeaks.forEach(leak => {
        const cleanupCount = this.memoryManager.cleanupEventListeners(leak.event)
        logger.info(`Cleaned up ${cleanupCount} ${leak.event} listeners`)
      })
    }

    // Perform general garbage collection
    this.memoryManager.performGarbageCollection()

    // Clear all caches if available
    if (window.gc && typeof window.gc === 'function') {
      window.gc()
    }

    // Log memory stats after cleanup
    const afterStats = this.memoryManager.getMemoryStats()
    logger.info(`Memory stats after cleanup:`, afterStats)

    // Calculate cleanup effectiveness
    const memoryFreed = beforeStats.memoryUsage - afterStats.memoryUsage
    const listenersCleaned = beforeStats.activeEventListeners - afterStats.activeEventListeners

    logger.info(`Memory cleanup effectiveness: ${(memoryFreed / 1024 / 1024).toFixed(2)}MB freed, ${listenersCleaned} event listeners cleaned`)

    // Emit critical memory event with detailed info
    this.emitMemoryEvent('critical', this.getCurrentMemory(), {
      memoryFreed,
      listenersCleaned,
      eventReport: afterStats.eventStats
    })
  }

  /**
   * Handle warning memory usage
   */
  handleWarningMemory() {
    if (!import.meta.env.DEV) return;
    
    // Check if translation is active before cleanup
    const isTranslationActive = typeof window !== 'undefined' && window.isTranslationInProgress;
    
    if (isTranslationActive) {
      logger.warn('High memory usage detected, but translation is active. Deferring cleanup until completion.')
      // Emit warning memory event but don't perform aggressive cleanup
      this.emitMemoryEvent('warning', this.getCurrentMemory())
      return;
    }

    logger.info('High memory usage detected, performing cleanup');

    // Perform garbage collection
    this.memoryManager.performGarbageCollection()

    // Emit warning memory event
    this.emitMemoryEvent('warning', this.getCurrentMemory())
  }

  /**
   * Detect potential memory leaks
   */
  detectLeaks() {
    if (!import.meta.env.DEV) return [];
    if (this.measurements.length < 10) return []

    const recent = this.measurements.slice(-10)
    const increasing = recent.every((curr, i) =>
      i === 0 || curr.used > recent[i-1].used
    )

    if (increasing) {
      const increaseRate = (recent[recent.length - 1].used - recent[0].used) / recent.length
      logger.warn('Potential memory leak detected', {
        increaseRate: `${(increaseRate / 1024 / 1024).toFixed(2)}MB per measurement`,
        measurements: recent.length
      })

      // Perform cleanup
      this.memoryManager.performGarbageCollection()

      // Emit leak detected event
      this.emitMemoryEvent('leak-detected', this.getCurrentMemory())
    }
    return [];
  }

  /**
   * Emit memory event
   * @param {string} type - Event type
   * @param {number} memoryUsage - Current memory usage
   */
  emitMemoryEvent(type, memoryUsage) {
    if (!import.meta.env.DEV) return;
    const event = new CustomEvent('memory-monitor-event', {
      detail: {
        type,
        memoryUsage,
        timestamp: Date.now(),
        stats: this.memoryManager.getMemoryStats()
      }
    })

    window.dispatchEvent(event)
  }

  /**
   * Get memory trend analysis
   * @returns {Object} Trend analysis
   */
  getTrendAnalysis() {
    if (!import.meta.env.DEV) return { trend: 'insufficient-data' };
    if (this.measurements.length < 2) {
      return { trend: 'insufficient-data' }
    }

    const recent = this.measurements.slice(-10)
    const first = recent[0].used
    const last = recent[recent.length - 1].used
    const change = last - first
    const changePercent = (change / first) * 100

    return {
      trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
      change: `${(change / 1024 / 1024).toFixed(2)}MB`,
      changePercent: `${changePercent.toFixed(2)}%`,
      period: `${recent.length} measurements`
    }
  }

  /**
   * Generate detailed memory report
   * @returns {Object} Memory report
   */
  generateReport() {
    if (!import.meta.env.DEV) return {};
    const current = this.getCurrentMemory()
    const trend = this.getTrendAnalysis()
    const managerStats = this.memoryManager.getMemoryStats()
    const leaks = this.memoryManager.detectMemoryLeaks()

    return {
      timestamp: new Date().toISOString(),
      currentMemory: {
        used: current,
        usedMB: (current / 1024 / 1024).toFixed(2),
        total: performance.memory?.totalJSHeapSize || 0,
        limit: performance.memory?.jsHeapSizeLimit || 0
      },
      trend,
      managerStats,
      warnings: leaks,
      measurements: this.measurements.length,
      thresholds: this.thresholds,
      isMonitoring: this.isMonitoring
    }
  }

  /**
   * Set custom thresholds
   * @param {Object} thresholds - New thresholds
   */
  setThresholds(thresholds) {
    if (!import.meta.env.DEV) return;
    this.thresholds = { ...this.thresholds, ...thresholds }
    logger.debug('Memory thresholds updated', this.thresholds)
  }

  /**
   * Get monitoring statistics
   */
  getStats() {
    if (!import.meta.env.DEV) return {};
    return {
      isMonitoring: this.isMonitoring,
      measurements: this.measurements.length,
      currentMemory: this.getCurrentMemory(),
      trend: this.getTrendAnalysis(),
      thresholds: this.thresholds
    }
  }

  /**
   * Export diagnostics data
   * @returns {Object} Diagnostics data
   */
  exportDiagnostics() {
    if (!import.meta.env.DEV) return {};
    return {
      memoryMonitor: this.generateReport(),
      memoryManager: this.memoryManager.generateReport(),
      performance: {
        memory: performance.memory,
        timing: performance.timing,
        navigation: performance.navigation
      }
    }
  }

  /**
   * Update memory thresholds
   * @param {Object} newThresholds - New threshold values
   */
  updateThresholds(newThresholds) {
    if (!import.meta.env.DEV) return;
    if (newThresholds.warning) {
      this.thresholds.warning = newThresholds.warning
    }
    if (newThresholds.critical) {
      this.thresholds.critical = newThresholds.critical
    }
    logger.info(`Memory thresholds updated: warning=${(this.thresholds.warning / 1024 / 1024).toFixed(2)}MB, critical=${(this.thresholds.critical / 1024 / 1024).toFixed(2)}MB`)
  }

  /**
   * Destroy memory monitor
   */
  destroy() {
    if (!import.meta.env.DEV) return;
    this.stopMonitoring()
    this.measurements = []
    logger.debug('Memory monitor destroyed')
  }
}

// Singleton instance
let memoryMonitorInstance = null

/**
 * Get the memory monitor instance
 * @param {Object} options - Configuration options
 */
export function getMemoryMonitor(options = {}) {
  if (!import.meta.env.DEV) return { /* no-op object for production */ };
  if (!memoryMonitorInstance) {
    const defaultOptions = {
      useCentralMonitoring: true,
      ...options
    }
    memoryMonitorInstance = new MemoryMonitor(defaultOptions)
  }
  return memoryMonitorInstance
}

/**
 * Start memory monitoring
 * @param {Object} options - Configuration options
 */
export function startMemoryMonitoring(options = {}) {
  if (!import.meta.env.DEV) return; // no-op for production
  const monitor = getMemoryMonitor(options)
  monitor.startMonitoring()
  return monitor
}

export default MemoryMonitor
