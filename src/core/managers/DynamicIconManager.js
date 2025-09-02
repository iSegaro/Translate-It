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
      // Set default provider
      this.currentProvider = 'google';

      logger.debug(`Current provider: ${this.currentProvider}`);

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

      logger.debug('Fetching base icon for the extension');

      const baseIconPath = `assets/icons/extension/extension_icon_128.png`;
      let baseIcon = null;

      logger.debug(`Attempting to fetch base icon from path: ${baseIconPath}`);

      try {
        const resolvedBaseIconPath = browser.runtime.getURL(baseIconPath);
        logger.debug(`Resolved base icon path: ${resolvedBaseIconPath}`);

        const baseIconResponse = await fetch(resolvedBaseIconPath);
        if (!baseIconResponse.ok) {
          throw new Error(`Failed to fetch base icon. Status: ${baseIconResponse.status}`);
        }
        const baseIconBlob = await baseIconResponse.blob();
        baseIcon = await this.blobToBase64(baseIconBlob);
      } catch (fetchError) {
        logger.error('Failed to fetch or process base icon:', fetchError);
        logger.warn('Proceeding without base icon overlay');
      }

      logger.debug(`Base icon data being sent: ${baseIcon ? baseIcon.substring(0, 100) : 'null'}`);

      logger.debug('Sending message to offscreen for icon generation');
      // Send message to offscreen document to generate simple overlay icon
      const response = await browser.runtime.sendMessage({
        target: 'offscreen',
        action: 'GENERATE_SIMPLE_OVERLAY_ICON',
        data: { provider, baseIcon }
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
      logger.error('Failed to create simple overlay icon via offscreen:', error);
    }

    return null;
  }

  getProviderIconPath(provider) {
    const iconMap = {
      'google': 'icons/providers/google.svg',
      'gemini': 'icons/providers/gemini.svg',
      'bing': 'icons/providers/bing.svg',
      'yandex': 'icons/providers/yandex.svg',
      'openai': 'icons/providers/openai.svg',
      'openrouter': 'icons/providers/openrouter.svg',
      'deepseek': 'icons/providers/deepseek.svg',
      'webai': 'icons/providers/webai.svg',
      'custom': 'icons/providers/custom.svg',
      'browserapi': 'icons/providers/chrome-translate.svg'
    };

    return 'assets/' + (iconMap[provider] || 'icons/providers/provider.svg');
  }

  async blobToBase64(blob) {
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
