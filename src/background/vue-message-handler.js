// Background script Vue message handler
// Handles messages from Vue applications (popup, sidepanel, options)

import { getBrowserAsync } from '../utils/browser-polyfill.js'
// Translation is now handled by the TranslationEngine, not directly by message handlers
import { ErrorTypes } from '../services/ErrorTypes.js'

export class VueMessageHandler {
  constructor() {
    this.handlers = new Map()
    this.browser = null
    this.setupHandlers()
  }

  async initializeBrowser() {
    if (!this.browser) {
      this.browser = await getBrowserAsync()
    }
    return this.browser
  }

  setupHandlers() {
    // Translation handlers
    this.handlers.set('TRANSLATE_TEXT', this.handleTranslation.bind(this))
    this.handlers.set('TRANSLATE_IMAGE', this.handleImageTranslation.bind(this))
    
    // Provider management handlers
    this.handlers.set('GET_PROVIDER_STATUS', this.handleProviderStatus.bind(this))
    this.handlers.set('TEST_PROVIDER_CONNECTION', this.handleTestProvider.bind(this))
    this.handlers.set('SAVE_PROVIDER_CONFIG', this.handleSaveProviderConfig.bind(this))
    this.handlers.set('GET_PROVIDER_CONFIG', this.handleGetProviderConfig.bind(this))
    
    // Screen capture handlers
    this.handlers.set('START_SCREEN_CAPTURE', this.handleStartScreenCapture.bind(this))
    this.handlers.set('CAPTURE_SCREEN_AREA', this.handleCaptureScreenArea.bind(this))
    
    // Extension feature handlers
    this.handlers.set('UPDATE_CONTEXT_MENU', this.handleUpdateContextMenu.bind(this))
    this.handlers.set('GET_EXTENSION_INFO', this.handleGetExtensionInfo.bind(this))
    
    // Logging handlers
    this.handlers.set('LOG_ERROR', this.handleLogError.bind(this))
  }

  async handleMessage(message, sender) {
    const { action, data } = message
    
    // Only handle messages from Vue apps
    if (message.source !== 'vue-app') {
      return null
    }
    
    const handler = this.handlers.get(action)
    if (!handler) {
      return { success: false, error: `Unknown action: ${action}` }
    }

    try {
      const result = await handler(data, sender)
      return { success: true, data: result }
    } catch (error) {
      console.error(`Vue message handler error for ${action}:`, error)
      return { 
        success: false, 
        error: error.message || 'Unknown error',
        type: error.type || ErrorTypes.UNKNOWN
      }
    }
  }

  // Translation handlers - DEPRECATED: Translation is now handled by TranslationEngine
  async handleTranslation(data) {
    // Translation is now handled by the TranslationEngine through the universal messaging protocol
    throw new Error('Translation through VueMessageHandler is deprecated. Use TranslationClient instead.')
  }

  async handleImageTranslation(data) {
    // Image translation is not yet implemented in the new messaging architecture
    throw new Error('Image translation is not available in the new architecture yet')
    const { imageData, from = 'auto', to = 'en', provider = 'gemini', mode = 'simple' } = data
    
    if (!imageData) {
      throw new Error('Image data cannot be empty')
    }

    try {
      const providerInstance = translationProviderFactory.getProvider(provider)
      
      if (typeof providerInstance.translateImage !== 'function') {
        throw new Error(`Provider ${provider} does not support image translation`)
      }
      
      const translatedText = await providerInstance.translateImage(imageData, from, to, mode)
      
      return {
        text: translatedText,
        sourceText: '[Image]',
        fromLanguage: from,
        toLanguage: to,
        provider: provider,
        mode: mode,
        timestamp: Date.now(),
        isImageTranslation: true
      }
    } catch (error) {
      console.error('Image translation error:', error)
      throw new Error(`Image translation failed: ${error.message}`)
    }
  }

  // Provider management handlers
  async handleProviderStatus(data) {
    // Provider status is now handled by the TranslationEngine
    throw new Error('Provider status through VueMessageHandler is deprecated')
    const { provider } = data
    
    try {
      // Check if provider is supported
      if (!translationProviderFactory.isProviderSupported(provider)) {
        return {
          status: 'unsupported',
          message: `Provider ${provider} is not supported`
        }
      }

      // Get provider instance and check configuration
      const providerInstance = translationProviderFactory.getProvider(provider)
      
      // For providers that need configuration, check if they're configured
      const needsConfig = ['gemini', 'openai', 'openrouter', 'deepseek', 'custom'].includes(provider)
      
      if (needsConfig) {
        const config = await this.getStoredProviderConfig(provider)
        if (!config || !config.apiKey) {
          return {
            status: 'unconfigured',
            message: 'API key required'
          }
        }
      }

      return {
        status: 'ready',
        message: 'Provider is ready',
        provider: provider
      }
    } catch (error) {
      return {
        status: 'error',
        message: error.message
      }
    }
  }

  async handleTestProvider(data) {
    // Provider testing is now handled by the TranslationEngine
    throw new Error('Provider testing through VueMessageHandler is deprecated')
    const { provider, config } = data
    
    try {
      const _providerInstance = translationProviderFactory.getProvider(provider)
      
      // For providers that need configuration, temporarily set it
      if (config) {
        // This is a test, so we don't save the config permanently
        if (config.apiKey) {
          // Set temporary configuration (implementation depends on provider)
          // For now, we'll do a simple translation test
        }
      }
      
      // Test with a simple translation
      const testText = 'Hello'
      const result = await _providerInstance.translate(testText, 'en', 'es', 'simple')
      
      return {
        success: true,
        message: 'Connection successful',
        testResult: result
      }
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Connection failed'
      }
    }
  }

  async handleSaveProviderConfig(data) {
    const { provider, apiKey, customUrl, model } = data
    
    try {
      const config = {
        apiKey,
        customUrl,
        model,
        timestamp: Date.now()
      }
      
      // Store configuration securely
      await this.storeProviderConfig(provider, config)
      
      return {
        success: true,
        message: 'Configuration saved'
      }
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error.message}`)
    }
  }

  async handleGetProviderConfig(data) {
    const { provider } = data
    
    try {
      const config = await this.getStoredProviderConfig(provider)
      return {
        config: config || {}
      }
    } catch (error) {
      throw new Error(`Failed to get configuration: ${error.message}`)
    }
  }

  // Screen capture handlers
  async handleStartScreenCapture(data, sender) {
    try {
      // Get active tab
      const browser = await this.initializeBrowser()
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (!tab) {
        throw new Error('No active tab found')
      }
      
      // Send message to content script to start capture UI
      await browser.tabs.sendMessage(tab.id, {
        action: 'START_SCREEN_CAPTURE',
        source: 'background'
      })
      
      return {
        success: true,
        message: 'Screen capture started'
      }
    } catch (error) {
      throw new Error(`Failed to start screen capture: ${error.message}`)
    }
  }

  async handleCaptureScreenArea(data) {
    const { coordinates } = data
    
    try {
      // Capture visible tab
      const browser = await this.initializeBrowser()
      const imageData = await browser.tabs.captureVisibleTab({
        format: 'png'
      })
      
      // If coordinates are provided, we would crop the image here
      // For now, return the full screenshot
      return {
        imageData,
        coordinates,
        timestamp: Date.now()
      }
    } catch (error) {
      throw new Error(`Failed to capture screen area: ${error.message}`)
    }
  }

  // Extension feature handlers
  async handleUpdateContextMenu(data) {
    const { menuItems } = data
    
    try {
      // Remove existing context menu items
      const browser = await this.initializeBrowser()
      await browser.contextMenus.removeAll()
      
      // Add new menu items
      if (menuItems && Array.isArray(menuItems)) {
        for (const item of menuItems) {
          await browser.contextMenus.create(item)
        }
      }
      
      return {
        success: true,
        message: 'Context menu updated'
      }
    } catch (error) {
      throw new Error(`Failed to update context menu: ${error.message}`)
    }
  }

  async handleGetExtensionInfo() {
    try {
      const browser = await this.initializeBrowser()
      const manifest = browser.runtime.getManifest()
      
      return {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        permissions: manifest.permissions || [],
        id: browser.runtime.id
      }
    } catch (error) {
      throw new Error(`Failed to get extension info: ${error.message}`)
    }
  }

  /**
   * Handle error logging from frontend apps
   */
  async handleLogError(data) {
    try {
      const { error, context, info } = data
      console.warn(`[${context}] Vue Error:`, error, info)
      
      // In production, you might want to send to a logging service
      // For now, just log to console and return success
      return {
        success: true,
        logged: true
      }
    } catch (error) {
      console.error('Failed to log error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Helper methods for storage
  async storeProviderConfig(provider, config) {
    const browser = await this.initializeBrowser()
    const key = `provider_config_${provider}`
    await browser.storage.local.set({ [key]: config })
  }

  async getStoredProviderConfig(provider) {
    const browser = await this.initializeBrowser()
    const key = `provider_config_${provider}`
    const result = await browser.storage.local.get(key)
    return result[key] || null
  }

  // Method to register this handler with the existing message system
  async register() {
    const browser = await this.initializeBrowser()
    // Add listener for runtime messages
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.source === 'vue-app') {
        // Handle async response properly
        this.handleMessage(message, _sender)
          .then(response => {
            sendResponse(response)
          })
          .catch(error => {
            console.error('Vue message handler error:', error)
            sendResponse({ success: false, error: error.message })
          })
        // Return true to indicate we will send response asynchronously
        return true
      }
      // Don't handle other messages
      return false
    })
  }
}

