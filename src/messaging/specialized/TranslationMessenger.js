/**
 * Specialized Translation Messenger
 * Handles all translation related messaging operations
 */

import { MessageActions } from '../core/MessageActions.js';

export class TranslationMessenger {
  constructor(context, parentMessenger) {
    this.context = context;
    this.messenger = parentMessenger;
  }

  /**
   * Translate text with enhanced options
   * @param {string} text - Text to translate
   * @param {Object} options - Translation options
   * @returns {Promise<Object>} Translation result
   */
  async translate(text, options = {}) {
    if (!text || !text.trim()) {
      throw new Error('Text to translate cannot be empty');
    }

    const translationOptions = {
      text: text.trim(),
      provider: options.provider || 'google',
      sourceLanguage: options.from || 'auto',
      targetLanguage: options.to || 'fa',
      mode: options.mode || 'normal',
      options: options.options || {},
      ...options
    };

    // Use provided messageId or generate new one
    const messageId = options.messageId || `${this.context}-translate-${Date.now()}`;

    // Send translation request via standard messaging
    return this.messenger.sendMessage({
      action: MessageActions.TRANSLATE,
      data: translationOptions,
      messageId: messageId,
      timestamp: Date.now()
    });
  }

  /**
   * Get translation history
   * @param {Object} options - History options
   * @returns {Promise<Array>} Translation history
   */
  async getHistory(options = {}) {
    const response = await this.messenger.sendMessage({
      action: MessageActions.GET_HISTORY,
      data: {
        limit: options.limit || 100,
        offset: options.offset || 0,
        ...options
      },
      timestamp: Date.now()
    });

    return response?.history || [];
  }

  /**
   * Clear translation history
   * @param {Object} options - Clear options
   * @returns {Promise<Object>} Clear result
   */
  async clearHistory(options = {}) {
    return this.messenger.sendMessage({
      action: MessageActions.CLEAR_HISTORY,
      data: options,
      timestamp: Date.now()
    });
  }

  /**
   * Get available translation providers
   * @returns {Promise<Array>} Available providers
   */
  async getProviders() {
    const response = await this.messenger.sendMessage({
      action: MessageActions.GET_PROVIDERS,
      timestamp: Date.now()
    });

    return response?.providers || [];
  }

  /**
   * Test provider connection
   * @param {string} provider - Provider name to test
   * @returns {Promise<Object>} Test result
   */
  async testProvider(provider) {
    if (!provider) {
      throw new Error('Provider name is required');
    }

    return this.messenger.sendMessage({
      action: 'TEST_PROVIDER',
      data: { provider },
      timestamp: Date.now()
    });
  }

  /**
   * Batch translate multiple texts
   * @param {Array} texts - Array of texts to translate
   * @param {Object} options - Translation options
   * @returns {Promise<Array>} Array of translation results
   */
  async batchTranslate(texts, options = {}) {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Array of texts is required for batch translation');
    }

    return this.messenger.sendMessage({
      action: MessageActions.BATCH_TRANSLATE,
      data: {
        texts,
        provider: options.provider || 'google',
        sourceLanguage: options.from || 'auto',
        targetLanguage: options.to || 'fa',
        ...options
      },
      timestamp: Date.now()
    });
  }
}

export default TranslationMessenger;