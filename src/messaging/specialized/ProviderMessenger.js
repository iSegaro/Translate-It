/**
 * Specialized Provider Messenger
 * Handles all API provider related messaging operations
 */

import { MessageActions } from '../core/MessageActions.js';

export class ProviderMessenger {
  constructor(context, parentMessenger) {
    this.context = context;
    this.messenger = parentMessenger;
  }

  /**
   * Get available providers
   * @returns {Promise<Array>} Array of available providers
   */
  async getProviders() {
    return this.messenger.sendMessage({
      action: MessageActions.GET_PROVIDERS,
      timestamp: Date.now()
    });
  }

  /**
   * Test provider connection
   * @param {string} providerId - Provider identifier
   * @param {Object} config - Provider configuration
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection(providerId, config = {}) {
    return this.messenger.sendMessage({
      action: MessageActions.TEST_PROVIDER_CONNECTION,
      data: {
        providerId,
        config
      },
      timestamp: Date.now()
    });
  }

  /**
   * Get provider configuration
   * @param {string} providerId - Provider identifier
   * @returns {Promise<Object>} Provider configuration
   */
  async getProviderConfig(providerId) {
    return this.messenger.sendMessage({
      action: MessageActions.GET_PROVIDER_CONFIG,
      data: { providerId },
      timestamp: Date.now()
    });
  }

  /**
   * Update provider configuration
   * @param {string} providerId - Provider identifier
   * @param {Object} config - New configuration
   * @returns {Promise<Object>} Update result
   */
  async updateProviderConfig(providerId, config) {
    return this.messenger.sendMessage({
      action: MessageActions.UPDATE_PROVIDER_CONFIG,
      data: {
        providerId,
        config
      },
      timestamp: Date.now()
    });
  }

  /**
   * Get provider status
   * @param {string} providerId - Provider identifier
   * @returns {Promise<Object>} Provider status
   */
  async getProviderStatus(providerId) {
    return this.messenger.sendMessage({
      action: MessageActions.GET_PROVIDER_STATUS,
      data: { providerId },
      timestamp: Date.now()
    });
  }

  /**
   * Set active provider
   * @param {string} providerId - Provider identifier
   * @returns {Promise<Object>} Set active provider result
   */
  async setActiveProvider(providerId) {
    return this.messenger.sendMessage({
      action: MessageActions.SET_ACTIVE_PROVIDER,
      data: { providerId },
      timestamp: Date.now()
    });
  }

  /**
   * Get provider capabilities
   * @param {string} providerId - Provider identifier
   * @returns {Promise<Object>} Provider capabilities
   */
  async getProviderCapabilities(providerId) {
    return this.messenger.sendMessage({
      action: MessageActions.GET_PROVIDER_CAPABILITIES,
      data: { providerId },
      timestamp: Date.now()
    });
  }

  /**
   * Validate API key for provider
   * @param {string} providerId - Provider identifier
   * @param {string} apiKey - API key to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateApiKey(providerId, apiKey) {
    return this.messenger.sendMessage({
      action: MessageActions.VALIDATE_API_KEY,
      data: {
        providerId,
        apiKey
      },
      timestamp: Date.now()
    });
  }
}

export default ProviderMessenger;