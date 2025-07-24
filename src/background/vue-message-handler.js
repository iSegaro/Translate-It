// Background script Vue message handler
// Handles messages from Vue applications (popup, sidepanel, options)

import { translationProviderFactory } from '../providers/factory/TranslationProviderFactory.js'
import { ErrorTypes } from '../services/ErrorTypes.js'

export class VueMessageHandler {
  constructor() {
    this.handlers = new Map()
    this.setupHandlers()
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

  // Translation handlers
  async handleTranslation(data) {
    const { text, from = 'auto', to = 'en', provider = 'google', mode = 'simple' } = data
    
    if (!text?.trim()) {
      throw new Error('Text to translate cannot be empty')
    }

    try {
      const providerInstance = translationProviderFactory.getProvider(provider)
      const translatedText = await providerInstance.translate(text, from, to, mode)
      
      return {
        text: translatedText,
        sourceText: text,
        fromLanguage: from,
        toLanguage: to,
        provider: provider,
        mode: mode,
        timestamp: Date.now()
      }
    } catch (error) {
      console.error('Translation error:', error)
      throw new Error(`Translation failed: ${error.message}`)
    }
  }

  async handleImageTranslation(data) {
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
    const { provider, config } = data
    
    try {
      const providerInstance = translationProviderFactory.getProvider(provider)
      
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
      const result = await providerInstance.translate(testText, 'en', 'es', 'simple')
      
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

  // Helper methods for storage
  async storeProviderConfig(provider, config) {
    const key = `provider_config_${provider}`
    await browser.storage.local.set({ [key]: config })
  }

  async getStoredProviderConfig(provider) {
    const key = `provider_config_${provider}`
    const result = await browser.storage.local.get(key)
    return result[key] || null
  }

  // Method to register this handler with the existing message system
  register() {
    // Add listener for runtime messages
    browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      if (message.source === 'vue-app') {
        const response = await this.handleMessage(message, sender)
        return response
      }
    })
  }
}

// Create and register the handler
export const vueMessageHandler = new VueMessageHandler()