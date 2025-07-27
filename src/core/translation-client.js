/**
 * Translation Client - Lightweight messaging client for UI contexts
 * Handles communication with background translation engine
 */

import { getBrowserAPI } from '../utils/browser-unified.js'
import { 
  createTranslationRequest,
  createProviderListRequest,
  createHistoryRequest,
  createClearCacheRequest,
  createClearHistoryRequest,
  validateTranslationRequest,
  TRANSLATION_ACTIONS,
  TRANSLATION_CONTEXTS,
  TRANSLATION_MODES,
  ERROR_TYPES
} from './translation-protocol.js'

export class TranslationClient {
  constructor(context) {
    if (!context || !Object.values(TRANSLATION_CONTEXTS).includes(context)) {
      throw new Error(`Invalid context: ${context}`)
    }
    
    this.context = context
    this.requestTimeout = this.getTimeoutForContext(context)
  }

  /**
   * Get appropriate timeout for context
   * @param {string} context 
   * @returns {number} Timeout in milliseconds
   */
  getTimeoutForContext(context) {
    switch (context) {
      case TRANSLATION_CONTEXTS.POPUP:
        return 10000 // 10 seconds for popup (fast response needed)
      case TRANSLATION_CONTEXTS.SELECTION:
        return 15000 // 15 seconds for selection
      case TRANSLATION_CONTEXTS.SIDEPANEL:
        return 45000 // 45 seconds for sidepanel (increased for async translations)
      case TRANSLATION_CONTEXTS.SUBTITLE:
        return 30000 // 30 seconds for subtitle processing
      case TRANSLATION_CONTEXTS.CAPTURE:
        return 30000 // 30 seconds for capture processing
      default:
        return 15000 // 15 seconds default
    }
  }

  /**
   * Translate text using background translation engine
   * @param {string} text - Text to translate
   * @param {Object} options - Translation options
   * @returns {Promise<TranslationResponse>}
   */
  async translate(text, options = {}) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Text to translate is required and must be a non-empty string')
    }

    const request = createTranslationRequest(this.context, text, options)
    
    if (!validateTranslationRequest(request)) {
      throw new Error('Invalid translation request')
    }

    try {
      const response = await this.sendMessage(request)
      
      if (response && response.success) {
        return response
      } else if (response && response.error) {
        const error = new Error(response.error.message || 'Translation failed')
        error.type = response.error.type
        error.code = response.error.code
        throw error
      } else {
        throw new Error('Invalid response from translation engine')
      }
    } catch (error) {
      console.error(`[TranslationClient:${this.context}] Translation error:`, error)
      
      // Re-throw with context information
      const contextError = new Error(`Translation failed in ${this.context}: ${error.message}`)
      contextError.type = error.type || ERROR_TYPES.TRANSLATION_ERROR
      contextError.context = this.context
      contextError.originalError = error
      
      throw contextError
    }
  }

  /**
   * Get available providers from background
   * @returns {Promise<Array>}
   */
  async getProviders() {
    try {
      const request = createProviderListRequest(this.context)
      const response = await this.sendMessage(request)
      
      if (response && response.success && response.providers) {
        return response.providers
      }
      
      // Fallback to static provider registry if background fails
      return this.getStaticProviders()
    } catch (error) {
      console.error(`[TranslationClient:${this.context}] Failed to get providers:`, error)
      return this.getStaticProviders()
    }
  }

  /**
   * Get static provider list (fallback)
   * @returns {Array}
   */
  getStaticProviders() {
    return [
      { id: 'google', name: 'Google Translate', category: 'free', needsApiKey: false },
      { id: 'bing', name: 'Bing Translate', category: 'free', needsApiKey: false },
      { id: 'yandex', name: 'Yandex Translate', category: 'free', needsApiKey: false },
      { id: 'gemini', name: 'Google Gemini', category: 'ai', needsApiKey: true },
      { id: 'openai', name: 'OpenAI GPT', category: 'ai', needsApiKey: true },
      { id: 'deepseek', name: 'DeepSeek', category: 'ai', needsApiKey: true },
      { id: 'openrouter', name: 'OpenRouter', category: 'ai', needsApiKey: true },
      { id: 'webai', name: 'WebAI to API', category: 'local', needsApiKey: false },
      { id: 'browser', name: 'Browser Translation', category: 'browser', needsApiKey: false },
      { id: 'custom', name: 'Custom API', category: 'custom', needsApiKey: true }
    ]
  }

  /**
   * Get translation history from background
   * @returns {Promise<Array>}
   */
  async getHistory() {
    try {
      const request = createHistoryRequest(this.context)
      const response = await this.sendMessage(request)
      
      if (response && response.success && response.history) {
        return response.history
      }
      
      return []
    } catch (error) {
      console.error(`[TranslationClient:${this.context}] Failed to get history:`, error)
      return []
    }
  }

  /**
   * Clear translation cache
   * @returns {Promise<boolean>}
   */
  async clearCache() {
    try {
      const request = createClearCacheRequest(this.context)
      const response = await this.sendMessage(request)
      
      return response && response.success
    } catch (error) {
      console.error(`[TranslationClient:${this.context}] Failed to clear cache:`, error)
      return false
    }
  }

  /**
   * Clear translation history
   * @returns {Promise<boolean>}
   */
  async clearHistory() {
    try {
      const request = createClearHistoryRequest(this.context)
      const response = await this.sendMessage(request)
      
      return response && response.success
    } catch (error) {
      console.error(`[TranslationClient:${this.context}] Failed to clear history:`, error)
      return false
    }
  }

  /**
   * Send message to background with timeout
   * @param {Object} message - Message to send
   * @returns {Promise<Object>}
   */
  async sendMessage(message) {
    return new Promise((resolve, reject) => {
      const sendMessageAsync = async () => {
        // Set timeout for the request
        const timeoutId = setTimeout(() => {
          reject(new Error(`Request timeout (${this.requestTimeout}ms) for context: ${this.context}`))
        }, this.requestTimeout)

        try {
        // Get browser API
        const Browser = await getBrowserAPI()
        
        console.log(`[TranslationClient:${this.context}] Sending message:`, message)
        // Send message to background
        const response = await Browser.runtime.sendMessage(message)
        console.log(`[TranslationClient:${this.context}] Received response:`, response)
        clearTimeout(timeoutId)
        resolve(response)
      } catch (error) {
        clearTimeout(timeoutId)
          reject(error)
        }
      }
      
      sendMessageAsync()
    })
  }

  /**
   * Quick translate with default options
   * @param {string} text - Text to translate
   * @param {string} [provider] - Provider to use
   * @returns {Promise<string>}
   */
  async quickTranslate(text, provider) {
    try {
      const response = await this.translate(text, { provider })
      return response.translatedText
    } catch (error) {
      throw new Error(`Quick translation failed: ${error.message}`)
    }
  }

  /**
   * Batch translate multiple texts
   * @param {Array<string>} texts - Texts to translate
   * @param {Object} options - Translation options
   * @returns {Promise<Array<string>>}
   */
  async batchTranslate(texts, options = {}) {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts array is required and must not be empty')
    }

    const results = []
    const batchOptions = { ...options, mode: TRANSLATION_MODES.BULK }

    for (const text of texts) {
      try {
        const response = await this.translate(text, batchOptions)
        results.push(response.translatedText)
      } catch (error) {
        console.error(`[TranslationClient:${this.context}] Batch translate error for text "${text.slice(0, 50)}...":`, error)
        results.push(`[Error: ${error.message}]`)
      }
    }

    return results
  }

  /**
   * Check if translation engine is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const providers = await this.getProviders()
      return Array.isArray(providers) && providers.length > 0
    } catch (error) {
      return false
    }
  }

  /**
   * Get client info
   * @returns {Object}
   */
  getInfo() {
    return {
      context: this.context,
      timeout: this.requestTimeout,
      version: '1.0.0'
    }
  }
}

/**
 * Create translation client for specific context
 * @param {string} context - Context name
 * @returns {TranslationClient}
 */
export function createTranslationClient(context) {
  return new TranslationClient(context)
}

/**
 * Export context constants for convenience
 */
export { TRANSLATION_CONTEXTS, TRANSLATION_MODES }