// src/utils/browser/ActionbarIconManager.js
import browser from 'webextension-polyfill';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

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

      // Create composite icon with provider overlay
      const compositeImageData = await this.createCompositeIcon(provider);

      if (compositeImageData) {
        await this.setBrowserIconWithImageData(compositeImageData);
        logger.debug(`✅ Icon updated for: ${provider}`);
      } else {
        logger.warn(`⚠️ Failed to create composite icon for: ${provider}`);
      }

    } catch (error) {
      logger.error(`❌ Failed to update icon for ${provider}:`, error);
    }
  }


  /**
   * Get icon path for provider
   */
  getProviderIconPath(provider) {
    // Map provider to icon path
    const providerIconPaths = {
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

    return providerIconPaths[provider] || 'icons/providers/provider.png';
  }

  // Note: The following methods are no longer needed with the new path-based approach:
// - generateCompositeIcon: Removed in favor of static icon paths
// - fetchIcon: Removed as we now use direct paths
// - fetchProviderIcon: Removed as we now use direct paths

  /**
   * Load image and convert to imageData using fetch and OffscreenCanvas
   */
  async loadImageData(iconPath) {
    try {
      // Get full URL for the icon
      const fullUrl = browser.runtime.getURL(iconPath);

      // Fetch the image
      const response = await fetch(fullUrl);
      if (!response.ok) {
        logger.error(`Failed to fetch image: ${fullUrl}`);
        return null;
      }

      // Create bitmap from image
      const bitmap = await createImageBitmap(await response.blob());

      // Convert to imageData for all sizes
      const imageData = {};
      const sizes = [16, 32, 48, 128];

      for (const size of sizes) {
        const canvas = new OffscreenCanvas(size, size);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, size, size);
        imageData[size] = ctx.getImageData(0, 0, size, size);
      }

      // Cleanup
      bitmap.close();

      return imageData;
    } catch (error) {
      logger.error('Error in loadImageData:', error);
      return null;
    }
  }

  /**
   * Create composite icon with provider overlay
   */
  async createCompositeIcon(provider) {
    try {
      // Load main extension icon
      const mainIconBitmap = await this.loadImageBitmap('icons/extension/extension_icon_128.png');

      // Load provider overlay icon
      const providerIconPath = this.getProviderIconPath(provider);
      const providerIconBitmap = await this.loadImageBitmap(providerIconPath);

      if (!mainIconBitmap || !providerIconBitmap) {
        logger.error('Failed to load main icon or provider icon');
        return null;
      }

      // Create composite for all sizes
      const compositeImageData = {};
      const sizes = [16, 32, 48, 128];

      for (const size of sizes) {
        const canvas = new OffscreenCanvas(size, size);
        const ctx = canvas.getContext('2d');

        // Draw main icon (scaled to full size)
        ctx.drawImage(mainIconBitmap, 0, 0, size, size);

        // Calculate overlay size and position (bottom-right corner)
        const overlaySize = Math.floor(size * 0.65); // 65% of main icon size for better visibility
        const overlayX = size - overlaySize - Math.floor(size * 0.02); // 2% padding
        const overlayY = size - overlaySize - Math.floor(size * 0.02);

        // Create temporary canvas for provider icon with transparency
        const providerCanvas = new OffscreenCanvas(overlaySize, overlaySize);
        const providerCtx = providerCanvas.getContext('2d');

        // Draw provider icon with scaling and transparency
        providerCtx.globalAlpha = 0.9; // Slight transparency for better blending
        providerCtx.drawImage(providerIconBitmap, 0, 0, overlaySize, overlaySize);

        // Draw provider overlay onto main canvas
        ctx.drawImage(providerCanvas, overlayX, overlayY);

        // Get final composite image data
        compositeImageData[size] = ctx.getImageData(0, 0, size, size);
      }

      // Cleanup
      mainIconBitmap.close();
      providerIconBitmap.close();

      return compositeImageData;
    } catch (error) {
      logger.error('Error creating composite icon:', error);
      return null;
    }
  }

  /**
   * Load image and return as ImageBitmap
   */
  async loadImageBitmap(iconPath) {
    try {
      // Get full URL for the icon
      const fullUrl = browser.runtime.getURL(iconPath);

      // Fetch the image
      const response = await fetch(fullUrl);
      if (!response.ok) {
        logger.error(`Failed to fetch image: ${fullUrl}`);
        return null;
      }

      // Create bitmap from image
      return await createImageBitmap(await response.blob());
    } catch (error) {
      logger.error('Error in loadImageBitmap:', error);
      return null;
    }
  }

  /**
   * Set browser icon with imageData
   */
  async setBrowserIconWithImageData(imageData) {
    try {
      if (browser.action && browser.action.setIcon) {
        await browser.action.setIcon({ imageData: imageData });
      } else if (browser.browserAction && browser.browserAction.setIcon) {
        await browser.browserAction.setIcon({ imageData: imageData });
      }
    } catch (error) {
      logger.error('Failed to set browser icon with imageData:', error);
      throw error;
    }
  }

  /**
   * Clear cache - No longer needed with path-based approach
   */
  clearCache() {
    // Cache is no longer used with path-based approach
    logger.debug('🧹 Icon cache cleared (no-op)');
  }

  /**
   * Destroy the icon manager and cleanup all resources
   */
  destroy() {
    // No cache to destroy with path-based approach
    // Call parent destroy
    super.destroy();
    logger.debug('🗑️ ActionbarIconManager destroyed');
  }
}

// Export singleton
export const actionbarIconManager = new ActionbarIconManager();
export default actionbarIconManager;