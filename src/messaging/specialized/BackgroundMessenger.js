/**
 * Specialized Background Messenger
 * Handles all background operations and warmup related messaging
 */

import { MessageActions } from '../core/MessageActions.js';

export class BackgroundMessenger {
  constructor(context, parentMessenger) {
    this.context = context;
    this.messenger = parentMessenger;
  }

  /**
   * Warm up background services
   * @returns {Promise<Object>} Warmup result
   */
  async warmupServices() {
    return this.messenger.sendMessage({
      action: MessageActions.WARMUP_BACKGROUND_SERVICES,
      timestamp: Date.now()
    });
  }

  /**
   * Get background service status
   * @returns {Promise<Object>} Service status
   */
  async getBackgroundStatus() {
    return this.messenger.sendMessage({
      action: MessageActions.GET_BACKGROUND_STATUS,
      timestamp: Date.now()
    });
  }

  /**
   * Restart background services
   * @returns {Promise<Object>} Restart result
   */
  async restartBackground() {
    return this.messenger.sendMessage({
      action: MessageActions.RESTART_BACKGROUND,
      timestamp: Date.now()
    });
  }

  /**
   * Get background performance metrics
   * @returns {Promise<Object>} Performance metrics
   */
  async getPerformanceMetrics() {
    return this.messenger.sendMessage({
      action: MessageActions.GET_BACKGROUND_METRICS,
      timestamp: Date.now()
    });
  }

  /**
   * Clear background cache
   * @returns {Promise<Object>} Clear cache result
   */
  async clearBackgroundCache() {
    return this.messenger.sendMessage({
      action: MessageActions.CLEAR_BACKGROUND_CACHE,
      timestamp: Date.now()
    });
  }

  /**
   * Schedule background task
   * @param {string} taskType - Type of task
   * @param {Object} taskData - Task configuration
   * @param {number} delay - Delay in milliseconds
   * @returns {Promise<Object>} Schedule result
   */
  async scheduleTask(taskType, taskData = {}, delay = 0) {
    return this.messenger.sendMessage({
      action: MessageActions.SCHEDULE_BACKGROUND_TASK,
      data: {
        taskType,
        taskData,
        delay
      },
      timestamp: Date.now()
    });
  }

  /**
   * Cancel scheduled background task
   * @param {string} taskId - Task identifier
   * @returns {Promise<Object>} Cancel result
   */
  async cancelTask(taskId) {
    return this.messenger.sendMessage({
      action: MessageActions.CANCEL_BACKGROUND_TASK,
      data: { taskId },
      timestamp: Date.now()
    });
  }

  /**
   * Get background logs
   * @param {Object} options - Log options (level, limit, since)
   * @returns {Promise<Object>} Background logs
   */
  async getBackgroundLogs(options = {}) {
    return this.messenger.sendMessage({
      action: MessageActions.GET_BACKGROUND_LOGS,
      data: options,
      timestamp: Date.now()
    });
  }

  /**
   * Set background service configuration
   * @param {Object} config - Background configuration
   * @returns {Promise<Object>} Configuration result
   */
  async setBackgroundConfig(config) {
    return this.messenger.sendMessage({
      action: MessageActions.SET_BACKGROUND_CONFIG,
      data: config,
      timestamp: Date.now()
    });
  }

  /**
   * Get memory usage statistics
   * @returns {Promise<Object>} Memory usage stats
   */
  async getMemoryStats() {
    return this.messenger.sendMessage({
      action: MessageActions.GET_MEMORY_STATS,
      timestamp: Date.now()
    });
  }

  /**
   * Force garbage collection (if available)
   * @returns {Promise<Object>} GC result
   */
  async forceGarbageCollection() {
    return this.messenger.sendMessage({
      action: MessageActions.FORCE_GARBAGE_COLLECTION,
      timestamp: Date.now()
    });
  }
}

export default BackgroundMessenger;