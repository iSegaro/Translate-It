// Global TTS Manager Singleton
// Manages TTS instances across all components to ensure exclusive playback

import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
import { MessageActions } from '@/messaging/core/MessageActions.js'
import { useBrowserAPI } from './useBrowserAPI.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TTSGlobalManager')
const browserAPI = useBrowserAPI('tts-global-manager')

/**
 * Singleton class to manage TTS instances globally
 */
class TTSGlobalManager {
  constructor() {
    if (TTSGlobalManager.instance) {
      return TTSGlobalManager.instance
    }

    this.activeTTSInstances = new Map() // instanceId -> { stopCallback, componentInfo }
    this.currentActiveId = null
    this.isInitialized = false
    
    TTSGlobalManager.instance = this
    this.initialize()
  }

  initialize() {
    if (this.isInitialized) return

    logger.debug('[TTSGlobalManager] Initializing global TTS manager')

    // Listen for page visibility changes
    this.setupVisibilityChangeHandler()
    
    // Listen for beforeunload to cleanup
    this.setupUnloadHandler()
    
    // Setup periodic cleanup for stale instances
    this.setupPeriodicCleanup()
    
    this.isInitialized = true
    logger.debug('[TTSGlobalManager] Global TTS manager initialized')
  }

  /**
   * Setup periodic cleanup for better memory management
   * @private
   */
  setupPeriodicCleanup() {
    // Clean up stale instances every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleInstances()
    }, 2 * 60 * 1000)
    
    logger.debug('[TTSGlobalManager] Periodic cleanup initialized')
  }

  /**
   * Register a TTS instance
   * @param {string} instanceId - Unique identifier for the instance
   * @param {Function} stopCallback - Function to call when stopping this instance
   * @param {Object} componentInfo - Information about the component
   */
  registerInstance(instanceId, stopCallback, componentInfo = {}) {
    logger.debug('[TTSGlobalManager] Registering TTS instance:', instanceId, componentInfo)
    
    this.activeTTSInstances.set(instanceId, {
      stopCallback,
      componentInfo: {
        type: componentInfo.type || 'unknown',
        name: componentInfo.name || 'unnamed',
        ...componentInfo
      },
      registeredAt: Date.now(),
      lastActivityAt: Date.now()
    })

    logger.debug(`[TTSGlobalManager] Active instances count: ${this.activeTTSInstances.size}`)
  }

  /**
   * Unregister a TTS instance
   * @param {string} instanceId - Instance ID to remove
   */
  unregisterInstance(instanceId) {
    if (!instanceId) return

    logger.debug('[TTSGlobalManager] Unregistering TTS instance:', instanceId)
    
    const wasActive = this.currentActiveId === instanceId
    
    this.activeTTSInstances.delete(instanceId)
    
    if (wasActive) {
      this.currentActiveId = null
    }

    logger.debug(`[TTSGlobalManager] Active instances count: ${this.activeTTSInstances.size}`)
  }

  /**
   * Start TTS for a specific instance (stops all others)
   * @param {string} instanceId - Instance starting TTS
   * @param {Object} options - TTS options
   */
  async startTTS(instanceId, options = {}) {
    logger.debug('[TTSGlobalManager] Starting TTS for instance:', instanceId, options)

    const instance = this.activeTTSInstances.get(instanceId)
    if (!instance) {
      logger.warn('[TTSGlobalManager] Instance not registered:', instanceId)
      return false
    }

    // Enforce exclusive playback rule - stop all other instances
    logger.debug('[TTSGlobalManager] Enforcing exclusive playback - stopping all other instances')
    await this.stopAllExcept(instanceId)

    // Mark this instance as active
    const previousActiveId = this.currentActiveId
    this.currentActiveId = instanceId

    // Update instance timestamp
    instance.lastActivityAt = Date.now()

    logger.debug(`[TTSGlobalManager] TTS started for instance: ${instanceId} (previous: ${previousActiveId})`)
    return true
  }

  /**
   * Stop all TTS instances
   */
  async stopAll() {
    logger.debug(`[TTSGlobalManager] Stopping all TTS instances (${this.activeTTSInstances.size} active)`)

    const stopPromises = []

    for (const [instanceId, instance] of this.activeTTSInstances.entries()) {
      try {
        logger.debug(`[TTSGlobalManager] Stopping instance: ${instanceId} (${instance.componentInfo.type})`)
        
        if (typeof instance.stopCallback === 'function') {
          stopPromises.push(
            Promise.resolve(instance.stopCallback()).catch(error => {
              logger.error(`[TTSGlobalManager] Failed to stop instance ${instanceId}:`, error)
            })
          )
        }
      } catch (error) {
        logger.error(`[TTSGlobalManager] Error stopping instance ${instanceId}:`, error)
      }
    }

    // Wait for all stop operations to complete
    await Promise.allSettled(stopPromises)

    // Clear active instance
    this.currentActiveId = null

    logger.debug('[TTSGlobalManager] All TTS instances stopped')
    return true
  }

  /**
   * Stop all instances except the specified one
   * @param {string} exceptInstanceId - Instance ID to keep running
   */
  async stopAllExcept(exceptInstanceId) {
    logger.debug(`[TTSGlobalManager] Stopping all TTS except: ${exceptInstanceId}`)

    const stopPromises = []

    for (const [instanceId, instance] of this.activeTTSInstances.entries()) {
      if (instanceId !== exceptInstanceId) {
        try {
          logger.debug(`[TTSGlobalManager] Stopping instance: ${instanceId}`)
          
          if (typeof instance.stopCallback === 'function') {
            stopPromises.push(
              Promise.resolve(instance.stopCallback()).catch(error => {
                logger.error(`[TTSGlobalManager] Failed to stop instance ${instanceId}:`, error)
              })
            )
          }
        } catch (error) {
          logger.error(`[TTSGlobalManager] Error stopping instance ${instanceId}:`, error)
        }
      }
    }

    await Promise.allSettled(stopPromises)
    
    logger.debug(`[TTSGlobalManager] All instances stopped except: ${exceptInstanceId}`)
  }

  /**
   * Get information about active instances
   */
  getActiveInstances() {
    const instances = []
    
    for (const [instanceId, instance] of this.activeTTSInstances.entries()) {
      instances.push({
        id: instanceId,
        isActive: instanceId === this.currentActiveId,
        componentInfo: instance.componentInfo,
        registeredAt: instance.registeredAt
      })
    }

    return instances
  }

  /**
   * Check if a specific instance is currently active
   * @param {string} instanceId - Instance ID to check
   */
  isInstanceActive(instanceId) {
    return this.currentActiveId === instanceId
  }

  /**
   * Get the currently active instance ID
   */
  getCurrentActiveId() {
    return this.currentActiveId
  }

  /**
   * Setup visibility change handler for tab switching
   * @private
   */
  setupVisibilityChangeHandler() {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logger.debug('[TTSGlobalManager] Tab hidden - stopping TTS for popup/content/windows-manager components')
        // Tab is now hidden - stop TTS for popup/content components (sidepanel persists)
        this.stopInstancesByType(['popup', 'content', 'windows-manager'])
      } else {
        logger.debug('[TTSGlobalManager] Tab visible again')
        // Tab is now visible - could potentially resume sidepanel TTS if needed
        this.handleTabVisible()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Store reference for cleanup
    this.visibilityChangeHandler = handleVisibilityChange
  }

  /**
   * Handle tab becoming visible
   * @private
   */
  handleTabVisible() {
    // Check if sidepanel has paused TTS that could be resumed
    const sidepanelInstances = this.getInstancesByType()['sidepanel'] || []
    
    if (sidepanelInstances.length > 0) {
      logger.debug('[TTSGlobalManager] Tab visible - sidepanel instances can continue TTS')
      // Note: Actual resume logic would be handled by individual components
    }
  }

  /**
   * Setup beforeunload handler for cleanup
   * @private
   */
  setupUnloadHandler() {
    const handleBeforeUnload = () => {
      logger.debug('[TTSGlobalManager] Page unloading - stopping all TTS')
      this.stopAll()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    // Store reference for cleanup
    this.beforeUnloadHandler = handleBeforeUnload
  }

  /**
   * Stop TTS instances of specific types
   * @param {string[]} types - Array of component types to stop
   */
  async stopInstancesByType(types) {
    logger.debug(`[TTSGlobalManager] Stopping instances of types:`, types)

    const stopPromises = []

    for (const [instanceId, instance] of this.activeTTSInstances.entries()) {
      if (types.includes(instance.componentInfo.type)) {
        try {
          logger.debug(`[TTSGlobalManager] Stopping ${instance.componentInfo.type} instance: ${instanceId}`)
          
          if (typeof instance.stopCallback === 'function') {
            stopPromises.push(
              Promise.resolve(instance.stopCallback()).catch(error => {
                logger.error(`[TTSGlobalManager] Failed to stop instance ${instanceId}:`, error)
              })
            )
          }
        } catch (error) {
          logger.error(`[TTSGlobalManager] Error stopping instance ${instanceId}:`, error)
        }
      }
    }

    await Promise.allSettled(stopPromises)
    
    logger.debug(`[TTSGlobalManager] Stopped instances of types:`, types)
  }

  /**
   * Enhanced cleanup with performance optimizations
   */
  cleanup() {
    logger.debug('[TTSGlobalManager] Cleaning up global TTS manager')

    // Clear periodic cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    // Remove event handlers
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler)
      this.visibilityChangeHandler = null
    }

    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler)
      this.beforeUnloadHandler = null
    }

    // Force stop all TTS
    this.forceStopAll()
    
    // Clear all instances
    this.activeTTSInstances.clear()
    this.currentActiveId = null
    this.isInitialized = false
    
    logger.debug('[TTSGlobalManager] Cleanup completed')
  }

  /**
   * Get manager statistics
   */
  getStats() {
    return {
      totalInstances: this.activeTTSInstances.size,
      currentActiveId: this.currentActiveId,
      isInitialized: this.isInitialized,
      instancesByType: this.getInstancesByType()
    }
  }

  /**
   * Get instances grouped by type
   * @private
   */
  getInstancesByType() {
    const byType = {}
    
    for (const [instanceId, instance] of this.activeTTSInstances.entries()) {
      const type = instance.componentInfo.type || 'unknown'
      if (!byType[type]) {
        byType[type] = []
      }
      byType[type].push({
        id: instanceId,
        name: instance.componentInfo.name,
        isActive: instanceId === this.currentActiveId,
        registeredAt: instance.registeredAt,
        lastActivityAt: instance.lastActivityAt
      })
    }

    return byType
  }

  /**
   * Force stop all TTS instances immediately (emergency cleanup)
   */
  async forceStopAll() {
    logger.debug('[TTSGlobalManager] Force stopping all TTS instances')
    
    // Send stop message to background directly
    try {
      await browserAPI.sendMessage({
        action: MessageActions.GOOGLE_TTS_STOP_ALL,
        data: {}
      })
      
      logger.debug('[TTSGlobalManager] Background TTS stop command sent')
    } catch (error) {
      logger.error('[TTSGlobalManager] Failed to send background stop command:', error)
    }
    
    // Clear all local state
    this.currentActiveId = null
    this.activeTTSInstances.clear()
    
    logger.debug('[TTSGlobalManager] Force stop completed')
  }

  /**
   * Check for stale instances and cleanup
   */
  cleanupStaleInstances() {
    const now = Date.now()
    const staleThreshold = 5 * 60 * 1000 // 5 minutes
    
    const staleInstances = []
    
    for (const [instanceId, instance] of this.activeTTSInstances.entries()) {
      if (now - instance.lastActivityAt > staleThreshold) {
        staleInstances.push(instanceId)
      }
    }
    
    if (staleInstances.length > 0) {
      logger.debug('[TTSGlobalManager] Cleaning up stale instances:', staleInstances)
      
      for (const instanceId of staleInstances) {
        this.unregisterInstance(instanceId)
      }
    }
  }

  /**
   * Update activity timestamp for an instance
   * @param {string} instanceId - Instance ID
   */
  updateInstanceActivity(instanceId) {
    const instance = this.activeTTSInstances.get(instanceId)
    if (instance) {
      instance.lastActivityAt = Date.now()
    }
  }
}

// Create singleton instance
const globalTTSManager = new TTSGlobalManager()

/**
 * Composable for using the global TTS manager
 * @param {Object} componentInfo - Information about the component using this composable
 */
export function useTTSGlobal(componentInfo = {}) {
  logger.debug('[useTTSGlobal] Creating TTS global composable for:', componentInfo)

  // Generate unique instance ID
  const instanceId = `${componentInfo.type || 'component'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  return {
    // Instance management
    instanceId,
    register: (stopCallback) => globalTTSManager.registerInstance(instanceId, stopCallback, componentInfo),
    unregister: () => globalTTSManager.unregisterInstance(instanceId),
    updateActivity: () => globalTTSManager.updateInstanceActivity(instanceId),
    
    // TTS control
    startTTS: (options) => globalTTSManager.startTTS(instanceId, options),
    stopAll: () => globalTTSManager.stopAll(),
    stopAllExcept: (exceptId) => globalTTSManager.stopAllExcept(exceptId || instanceId),
    forceStopAll: () => globalTTSManager.forceStopAll(),
    
    // State queries
    isActive: () => globalTTSManager.isInstanceActive(instanceId),
    getCurrentActiveId: () => globalTTSManager.getCurrentActiveId(),
    getActiveInstances: () => globalTTSManager.getActiveInstances(),
    getStats: () => globalTTSManager.getStats(),
    
    // Maintenance
    cleanupStaleInstances: () => globalTTSManager.cleanupStaleInstances(),
    
    // Manager reference
    manager: globalTTSManager
  }
}

// Export singleton for direct access
export { globalTTSManager as TTSGlobalManager }

// Default export
export default useTTSGlobal