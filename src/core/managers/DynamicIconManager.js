// src/core/managers/DynamicIconManager.js
import browser from 'webextension-polyfill';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'DynamicIconManager');

class DynamicIconManager {
  constructor() {
    this.currentProvider = null;
    this.iconCache = new Map();
    this.isInitialized = false;
    this.offscreenDocumentCreated = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      // Get current provider from storage
      const storedProvider = await storageManager.get('TRANSLATION_API');
      this.currentProvider = storedProvider || 'google';

      logger.debug(`Current provider: ${this.currentProvider}`);

      // Update icon immediately
      await this.updateIcon();

      // Listen for settings changes
      storageManager.on('change', async (data) => {
        if (data.key === 'TRANSLATION_API' && data.newValue !== this.currentProvider) {
          logger.debug(`Provider changed from ${this.currentProvider} to ${data.newValue}`);
          this.currentProvider = data.newValue;
          await this.updateIcon();
        }
      });

      this.isInitialized = true;
      logger.debug('✅ DynamicIconManager initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize DynamicIconManager:', error);
      // Don't throw, just log
    }
  }

  async updateIcon() {
    try {
      logger.debug(`🔄 Updating icon for provider: ${this.currentProvider}`);

      // Generate composite icon for the current provider
      const compositeIcon = await this.generateCompositeIcon(this.currentProvider);

      if (compositeIcon) {
        // Directly set the ImageData to the browser action icon
        await browser.action.setIcon({ imageData: compositeIcon });
        logger.debug(`✅ Icon updated successfully for provider: ${this.currentProvider}`);
      } else {
        logger.warn(`⚠️ Failed to generate composite icon for provider: ${this.currentProvider}`);
      }
    } catch (error) {
      logger.error('❌ Failed to update icon:', error);
    }
  }

  async generateCompositeIcon(provider) {
    const cacheKey = `icon_${provider}`;
    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey);
    }

    try {
      // Create simple overlay icon
      const compositeIcon = await this.createSimpleOverlayIcon(provider);

      // Cache the result
      this.iconCache.set(cacheKey, compositeIcon);

      return compositeIcon;
    } catch (error) {
      logger.error(`❌ Failed to generate composite icon for ${provider}:`, error);
      return null;
    }
  }

  async createSimpleOverlayIcon(provider) {
    try {
      logger.debug('Ensuring offscreen document exists for icon generation');

      // Check if offscreen document exists, create if not
      if (!this.offscreenDocumentCreated) {
        await browser.offscreen.createDocument({
          url: 'html/offscreen.html',
          reasons: ['DOM_PARSER'],
          justification: 'Generate dynamic overlay icons for providers'
        });
        this.offscreenDocumentCreated = true;
        logger.debug('Offscreen document created for icon generation');
      } else {
        logger.debug('Offscreen document already exists, skipping creation');
      }

      logger.debug('Fetching base and provider icons for composite generation');

      // Fetch base icon
      const baseIconPath = `assets/icons/extension/extension_icon_32.png`;
      let baseIconBlob = null;

      try {
        const resolvedBaseIconPath = browser.runtime.getURL(baseIconPath);
        logger.debug(`Fetching base icon from: ${resolvedBaseIconPath}`);

        const baseIconResponse = await fetch(resolvedBaseIconPath);
        if (!baseIconResponse.ok) {
          throw new Error(`Failed to fetch base icon. Status: ${baseIconResponse.status}`);
        }
        baseIconBlob = await baseIconResponse.blob();
        logger.debug('Base icon fetched successfully');
      } catch (fetchError) {
        logger.error('Failed to fetch base icon:', fetchError);
        return null; // Cannot proceed without base icon
      }

      // Fetch provider icon
      const providerIconPath = this.getProviderIconPath(provider);
      let providerIconBlob = null;

      try {
        const resolvedProviderIconPath = browser.runtime.getURL(providerIconPath);
        logger.debug(`Fetching provider icon from: ${resolvedProviderIconPath}`);

        const providerIconResponse = await fetch(resolvedProviderIconPath);
        if (!providerIconResponse.ok) {
          throw new Error(`Failed to fetch provider icon. Status: ${providerIconResponse.status}`);
        }
        providerIconBlob = await providerIconResponse.blob();
        logger.debug('Provider icon fetched successfully');
      } catch (fetchError) {
        logger.error('Failed to fetch provider icon:', fetchError);
        // Continue with base icon only
      }

      logger.debug('Sending message to offscreen for composite icon generation');

      // Send message to offscreen document to generate composite icon
      const response = await browser.runtime.sendMessage({
        target: 'offscreen',
        action: 'GENERATE_COMPOSITE_ICON',
        data: { 
          baseBlob: await this.blobToDataURL(baseIconBlob),
          overlayBlob: providerIconBlob ? await this.blobToDataURL(providerIconBlob) : null
        }
      });

      logger.debug('Received response from offscreen:', response);

      if (response && response.success && response.imageData) {
        // Convert back to ImageData
        const imageData = new ImageData(
          new Uint8ClampedArray(response.imageData.data),
          response.imageData.width,
          response.imageData.height
        );
        return imageData;
      }
    } catch (error) {
      logger.error('Failed to create composite icon via offscreen:', error);
    }

    return null;
  }

  getProviderIconPath(provider) {
    const iconMap = {
      'google': 'icons/providers/google.png',
      'gemini': 'icons/providers/gemini.png',
      'bing': 'icons/providers/bing.png',
      'yandex': 'icons/providers/yandex.png',
      'openai': 'icons/providers/openai.png',
      'openrouter': 'icons/providers/openrouter.png',
      'deepseek': 'icons/providers/deepseek.png',
      'webai': 'icons/providers/webai.png',
      'custom': 'icons/providers/custom.png',
      'browserapi': 'icons/providers/chrome-translate.png'
    };

    return 'assets/' + (iconMap[provider] || 'icons/providers/provider.png');
  }

  async blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Method to manually refresh icon (useful for debugging)
  async refreshIcon() {
    await this.updateIcon();
  }
}

// Export singleton instance
export const dynamicIconManager = new DynamicIconManager();
export default dynamicIconManager;
