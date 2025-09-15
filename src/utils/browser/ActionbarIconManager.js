// src/utils/browser/ActionbarIconManager.js
import browser from 'webextension-polyfill';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import SmartCache from '@/core/memory/SmartCache.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'ActionbarIconManager');

/**
 * Actionbar Icon Manager - Minimal, fast, reliable
 * Manages browser action bar icons with dynamic provider overlays
 */
class ActionbarIconManager extends ResourceTracker {
  constructor() {
    super('actionbar-icon-manager')
    this.currentProvider = null;
    this.isInitialized = false;
    this.iconCache = new SmartCache({ maxSize: 50, defaultTTL: 1800000, isCritical: true }); // 30 minutes TTL, mark as critical
    
    // Provider icon mapping
    this.providerIcons = {
      'google': 'icons/providers/google.png',
      'gemini': 'icons/providers/gemini.png', 
      'bing': 'icons/providers/bing.png',
      'yandex': 'icons/providers/yandex.png',
      'openai': 'icons/providers/openai.png',
      'openrouter': 'icons/providers/openrouter.png',
      'deepseek': 'icons/providers/deepseek.png',
      'webai': 'icons/providers/webai.png',
      'custom': 'icons/providers/custom.png',
      'browserapi': 'icons/providers/chrome-translate.png',
      'browser': 'icons/providers/provider.png'
    };
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      // Get current provider
      const storedProvider = await storageManager.get('TRANSLATION_API');
      this.currentProvider = storedProvider.TRANSLATION_API || 'google';

      logger.debug(`🎯 Simple icon manager initialized for: ${this.currentProvider}`);

      // Update icon immediately
      await this.updateIcon(this.currentProvider);

      // Listen for provider changes using tracked event listener
      this.addEventListener(storageManager, 'change', async (data) => {
        if (data.key === 'TRANSLATION_API' && data.newValue !== this.currentProvider) {
          this.currentProvider = data.newValue;
          await this.updateIcon(this.currentProvider);
        }
      });

      this.isInitialized = true;
      
    } catch (error) {
      logger.error('❌ Failed to initialize ActionbarIconManager:', error);
    }
  }

  /**
   * Update icon for provider
   */
  async updateIcon(provider) {
    try {
      logger.debug(`🎨 Updating icon for: ${provider}`);
      
      // Check simple cache first
      let imageData = this.iconCache.get(provider);
      
      if (!imageData) {
        // Generate new icon
        imageData = await this.generateCompositeIcon(provider);
        if (imageData) {
          this.iconCache.set(provider, imageData);
          logger.debug(`💾 Cached icon for: ${provider}`);
        }
      } else {
        logger.debug(`📦 Using cached icon for: ${provider}`);
      }

      if (imageData) {
        await this.setBrowserIcon(imageData);
        logger.debug(`✅ Icon updated for: ${provider}`);
      }
      
    } catch (error) {
      logger.error(`❌ Failed to update icon for ${provider}:`, error);
    }
  }

  /**
   * Generate composite icon (base + provider overlay)
   */
  async generateCompositeIcon(provider) {
    try {
      // Fetch icons
      const baseIconPath = typeof browser !== 'undefined' && browser.runtime
        ? browser.runtime.getURL('icons/extension/extension_icon_32.png')
        : 'assets/icons/extension/extension_icon_32.png';
      const baseIconBlob = await this.fetchIcon(baseIconPath);
      const providerIconBlob = await this.fetchProviderIcon(provider);

      if (!baseIconBlob) {
        throw new Error('Base icon not found');
      }

      // Create ImageBitmaps
      const baseImageBitmap = await createImageBitmap(baseIconBlob);
      const providerImageBitmap = providerIconBlob ? await createImageBitmap(providerIconBlob) : null;

      // Create OffscreenCanvas
      const canvas = new OffscreenCanvas(32, 32);
      const ctx = canvas.getContext('2d');

      // Draw base icon
      ctx.drawImage(baseImageBitmap, 0, 0, 32, 32);

      // Draw provider overlay
      if (providerImageBitmap) {
        const overlaySize = 20;
        const overlayX = 32 - overlaySize - 2;
        const overlayY = 32 - overlaySize - 2;
        ctx.drawImage(providerImageBitmap, overlayX, overlayY, overlaySize, overlaySize);
      }

      // Get ImageData
      const imageData = ctx.getImageData(0, 0, 32, 32);
      
      // Cleanup
      baseImageBitmap.close();
      if (providerImageBitmap) providerImageBitmap.close();
      
      return imageData;
      
    } catch (error) {
      logger.debug(`❌ Icon generation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch icon blob
   */
  async fetchIcon(iconPath) {
    try {
      const resolvedPath = browser.runtime.getURL(iconPath);
      const response = await fetch(resolvedPath);
      return response.ok ? await response.blob() : null;
      } catch {
      logger.debug(`Failed to fetch: ${iconPath}`);
      return null;
    }
  }

  /**
   * Fetch provider icon
   */
  async fetchProviderIcon(provider) {
    const iconPath = this.providerIcons[provider] || 'icons/providers/provider.png';
    // Use runtime.getURL for extension icons
    if (typeof browser !== 'undefined' && browser.runtime) {
      return this.fetchIcon(browser.runtime.getURL(iconPath));
    }
    return this.fetchIcon('assets/' + iconPath);
  }

  /**
   * Set browser icon
   */
  async setBrowserIcon(imageData) {
    try {
      const iconSizes = { 16: imageData, 32: imageData };
      
      if (browser.action && browser.action.setIcon) {
        await browser.action.setIcon({ imageData: iconSizes });
      } else if (browser.browserAction && browser.browserAction.setIcon) {
        await browser.browserAction.setIcon({ imageData: iconSizes });
      }
    } catch (error) {
      logger.debug('❌ Failed to set browser icon:', error);
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.iconCache.clear();
    logger.debug('🧹 Icon cache cleared');
  }

  /**
   * Destroy the icon manager and cleanup all resources
   */
  destroy() {
    this.iconCache.destroy();
    // Call parent destroy
    super.destroy();
    logger.debug('🗑️ ActionbarIconManager destroyed');
  }
}

// Export singleton
export const actionbarIconManager = new ActionbarIconManager();
export default actionbarIconManager;