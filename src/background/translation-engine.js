/**
 * Translation Engine - Centralized translation hub for background service worker
 * Handles all translation requests from UI contexts via messaging
 */

import { TranslationProviderFactory } from './providers/TranslationProviderFactory.js'
import { getBrowserAPI } from '../utils/browser-unified.js'

export class TranslationEngine {
  constructor() {
    this.providers = new Map()
    this.cache = new Map()
    this.history = []
    this.factory = new TranslationProviderFactory()
  }

  /**
   * Setup message listener for translation requests
   */
  async setupMessageListener() {
    const Browser = await getBrowserAPI()
    
    if (Browser.runtime.onMessage.hasListener(this.handleMessage.bind(this))) {
      return
    }
    
    Browser.runtime.onMessage.addListener(this.handleMessage.bind(this))
  }

  /**
   * Handle incoming messages from UI contexts
   */
  async handleMessage(request, sender, sendResponse) {
    if (request.action === 'TRANSLATE') {
      try {
        const result = await this.handleTranslateMessage(request, sender)
        return result
      } catch (error) {
        console.error('[TranslationEngine] Error handling message:', error)
        return this.formatError(error, request.context)
      }
    }
    
    // Let other message handlers process non-translation messages
    return undefined
  }

  /**
   * Handle translation request messages
   */
  async handleTranslateMessage(request, sender) {
    const { context, data } = request
    
    try {
      // Context-specific optimizations
      if (context === 'popup') {
        // Fast response priority for popup
        return await this.translateWithPriority(data)
      } else if (context === 'selection') {
        // Background processing OK for selection
        return await this.translateWithCache(data)
      } else if (context === 'sidepanel') {
        // Enhanced features for sidepanel
        return await this.translateWithHistory(data)
      }
      
      return await this.executeTranslation(data)
    } catch (error) {
      console.error('[TranslationEngine] Translation error:', error)
      return this.formatError(error, context)
    }
  }

  /**
   * Execute translation with priority (for popup)
   */
  async translateWithPriority(data) {
    // Check cache first for instant response
    const cacheKey = this.generateCacheKey(data)
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)
      return {
        ...cached,
        fromCache: true
      }
    }

    return await this.executeTranslation(data)
  }

  /**
   * Execute translation with cache checking (for selection)
   */
  async translateWithCache(data) {
    const cacheKey = this.generateCacheKey(data)
    
    // Return cached result if available
    if (this.cache.has(cacheKey)) {
      return {
        ...this.cache.get(cacheKey),
        fromCache: true
      }
    }

    const result = await this.executeTranslation(data)
    
    // Cache the result
    this.cacheResult(cacheKey, result)
    
    return result
  }

  /**
   * Execute translation with history tracking (for sidepanel)
   */
  async translateWithHistory(data) {
    const result = await this.executeTranslation(data)
    
    // Add to history for sidepanel
    this.addToHistory(data, result)
    
    return result
  }

  /**
   * Core translation execution logic
   */
  async executeTranslation(data) {
    const { text, provider, sourceLanguage, targetLanguage, mode } = data
    
    if (!text || text.trim().length === 0) {
      throw new Error('Text to translate is required')
    }

    // Get or create provider instance
    const providerInstance = await this.getProvider(provider)
    
    if (!providerInstance) {
      throw new Error(`Provider '${provider}' not found or failed to initialize`)
    }

    // Execute translation
    const result = await providerInstance.translate(text, sourceLanguage, targetLanguage, mode)
    
    const response = {
      success: true,
      translatedText: result,
      provider,
      sourceLanguage,
      targetLanguage,
      originalText: text,
      timestamp: Date.now(),
      mode: mode || 'simple'
    }

    return response
  }

  /**
   * Get or create provider instance
   */
  async getProvider(providerId) {
    // Return cached provider if available
    if (this.providers.has(providerId)) {
      return this.providers.get(providerId)
    }

    try {
      // Create new provider instance
      const provider = await this.factory.createProvider(providerId)
      
      if (provider) {
        this.providers.set(providerId, provider)
        return provider
      }
    } catch (error) {
      console.error(`[TranslationEngine] Failed to create provider '${providerId}':`, error)
    }

    return null
  }

  /**
   * Generate cache key for translation request
   */
  generateCacheKey(data) {
    const { text, provider, sourceLanguage, targetLanguage, mode } = data
    return `${provider}:${sourceLanguage}:${targetLanguage}:${mode}:${text.slice(0, 100)}`
  }

  /**
   * Cache translation result
   */
  cacheResult(cacheKey, result) {
    // Limit cache size to prevent memory issues
    if (this.cache.size >= 100) {
      // Remove oldest entries
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(cacheKey, {
      ...result,
      cachedAt: Date.now()
    })
  }

  /**
   * Add translation to history
   */
  addToHistory(data, result) {
    const historyItem = {
      id: Date.now().toString(),
      originalText: data.text,
      translatedText: result.translatedText,
      provider: data.provider,
      sourceLanguage: data.sourceLanguage,
      targetLanguage: data.targetLanguage,
      timestamp: Date.now(),
      mode: data.mode
    }

    this.history.unshift(historyItem)

    // Limit history size
    if (this.history.length > 50) {
      this.history = this.history.slice(0, 50)
    }

    // Optionally save to storage
    this.saveHistoryToStorage()
  }

  /**
   * Save history to browser storage
   */
  async saveHistoryToStorage() {
    try {
      const Browser = await getBrowserAPI()
      await Browser.storage.local.set({
        translationHistory: this.history
      })
    } catch (error) {
      console.error('[TranslationEngine] Failed to save history:', error)
    }
  }

  /**
   * Load history from browser storage
   */
  async loadHistoryFromStorage() {
    try {
      const Browser = await getBrowserAPI()
      const data = await Browser.storage.local.get(['translationHistory'])
      if (data.translationHistory) {
        this.history = data.translationHistory
      }
    } catch (error) {
      console.error('[TranslationEngine] Failed to load history:', error)
    }
  }

  /**
   * Format error response
   */
  formatError(error, context) {
    return {
      success: false,
      error: {
        type: 'TRANSLATION_ERROR',
        message: error.message || 'Translation failed',
        context: context || 'unknown',
        timestamp: Date.now()
      }
    }
  }

  /**
   * Get available providers list
   */
  async getAvailableProviders() {
    try {
      return await this.factory.getAvailableProviders()
    } catch (error) {
      console.error('[TranslationEngine] Failed to get providers:', error)
      return []
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear()
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = []
    this.saveHistoryToStorage()
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      providers: this.providers.size
    }
  }

  /**
   * Initialize engine (call from background script)
   */
  async initialize() {
    try {
      await this.setupMessageListener()
      await this.loadHistoryFromStorage()
      console.log('[TranslationEngine] Initialized successfully')
    } catch (error) {
      console.error('[TranslationEngine] Initialization failed:', error)
    }
  }
}