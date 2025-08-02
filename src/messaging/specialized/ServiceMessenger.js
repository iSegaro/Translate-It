/**
 * Specialized Service Messenger
 * Handles all translation service related messaging operations
 */

import { MessageActions } from '../core/MessageActions.js';

export class ServiceMessenger {
  constructor(context, parentMessenger) {
    this.context = context;
    this.messenger = parentMessenger;
  }

  /**
   * Get translation service status
   * @returns {Promise<Object>} Service status
   */
  async getServiceStatus() {
    return this.messenger.sendMessage({
      action: MessageActions.GET_SERVICE_STATUS,
      timestamp: Date.now()
    });
  }

  /**
   * Initialize translation service
   * @param {Object} config - Service configuration
   * @returns {Promise<Object>} Initialization result
   */
  async initializeService(config = {}) {
    return this.messenger.sendMessage({
      action: MessageActions.INITIALIZE_SERVICE,
      data: config,
      timestamp: Date.now()
    });
  }

  /**
   * Restart translation service
   * @returns {Promise<Object>} Restart result
   */
  async restartService() {
    return this.messenger.sendMessage({
      action: MessageActions.RESTART_SERVICE,
      timestamp: Date.now()
    });
  }

  /**
   * Get service configuration
   * @returns {Promise<Object>} Service configuration
   */
  async getServiceConfig() {
    return this.messenger.sendMessage({
      action: MessageActions.GET_SERVICE_CONFIG,
      timestamp: Date.now()
    });
  }

  /**
   * Update service configuration
   * @param {Object} config - New configuration
   * @returns {Promise<Object>} Update result
   */
  async updateServiceConfig(config) {
    return this.messenger.sendMessage({
      action: MessageActions.UPDATE_SERVICE_CONFIG,
      data: config,
      timestamp: Date.now()
    });
  }

  /**
   * Get service metrics
   * @returns {Promise<Object>} Service metrics
   */
  async getServiceMetrics() {
    return this.messenger.sendMessage({
      action: MessageActions.GET_SERVICE_METRICS,
      timestamp: Date.now()
    });
  }

  /**
   * Clear service cache
   * @returns {Promise<Object>} Clear cache result
   */
  async clearCache() {
    return this.messenger.sendMessage({
      action: MessageActions.CLEAR_SERVICE_CACHE,
      timestamp: Date.now()
    });
  }

  /**
   * Get translation history
   * @param {Object} options - Query options (limit, offset, filters)
   * @returns {Promise<Object>} Translation history
   */
  async getTranslationHistory(options = {}) {
    return this.messenger.sendMessage({
      action: MessageActions.GET_TRANSLATION_HISTORY,
      data: options,
      timestamp: Date.now()
    });
  }

  /**
   * Clear translation history
   * @param {Object} options - Clear options (before date, specific entries)
   * @returns {Promise<Object>} Clear result
   */
  async clearTranslationHistory(options = {}) {
    return this.messenger.sendMessage({
      action: MessageActions.CLEAR_TRANSLATION_HISTORY,
      data: options,
      timestamp: Date.now()
    });
  }

  /**
   * Export service data
   * @param {Object} options - Export options (format, data types)
   * @returns {Promise<Object>} Export result
   */
  async exportData(options = {}) {
    return this.messenger.sendMessage({
      action: MessageActions.EXPORT_SERVICE_DATA,
      data: options,
      timestamp: Date.now()
    });
  }

  /**
   * Import service data
   * @param {Object} data - Data to import
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Import result
   */
  async importData(data, options = {}) {
    return this.messenger.sendMessage({
      action: MessageActions.IMPORT_SERVICE_DATA,
      data: { data, options },
      timestamp: Date.now()
    });
  }
}

export default ServiceMessenger;