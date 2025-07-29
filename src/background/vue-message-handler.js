// Background script Vue message handler
// Handles messages from Vue applications (popup, sidepanel, options)

// Translation is now handled by the TranslationEngine, not directly by message handlers
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { ErrorHandler } from "../error-management/ErrorHandler.js";
import browser from "webextension-polyfill";

export class VueMessageHandler {
  constructor() {
    this.handlers = new Map();
    this.errorHandler = new ErrorHandler();
    this.setupHandlers();
  }

  setupHandlers() {
    // Translation handlers (TRANSLATE action is now handled by MessageRouter)
    // Keep only image translation which has special handling
    this.handlers.set(
      "TRANSLATE_IMAGE",
      this.handleImageTranslation.bind(this),
    );

    // Provider management handlers
    this.handlers.set(
      "GET_PROVIDER_STATUS",
      this.handleProviderStatus.bind(this),
    );
    this.handlers.set(
      "TEST_PROVIDER_CONNECTION",
      this.handleTestProvider.bind(this),
    );
    this.handlers.set(
      "SAVE_PROVIDER_CONFIG",
      this.handleSaveProviderConfig.bind(this),
    );
    this.handlers.set(
      "GET_PROVIDER_CONFIG",
      this.handleGetProviderConfig.bind(this),
    );

    // Screen capture handlers
    this.handlers.set(
      "START_SCREEN_CAPTURE",
      this.handleStartScreenCapture.bind(this),
    );
    this.handlers.set(
      "CAPTURE_SCREEN_AREA",
      this.handleCaptureScreenArea.bind(this),
    );

    // Extension feature handlers
    this.handlers.set(
      "UPDATE_CONTEXT_MENU",
      this.handleUpdateContextMenu.bind(this),
    );
    this.handlers.set(
      "GET_EXTENSION_INFO",
      this.handleGetExtensionInfo.bind(this),
    );

    // Logging handlers
    this.handlers.set("LOG_ERROR", this.handleLogError.bind(this));
  }

  async handleMessage(message, sender) {
    const { action, data } = message;

    // Only handle messages from Vue apps
    if (message.source !== "vue-app") {
      return null;
    }

    const handler = this.handlers.get(action);
    if (!handler) {
      return { success: false, error: `Unknown action: ${action}` };
    }

    try {
      const result = await handler(data, sender);
      return { success: true, data: result };
    } catch (error) {
      this.errorHandler.handle(error, {
        type: error.type || ErrorTypes.UNKNOWN,
        context: `VueMessageHandler:${action}`,
        messageData: data,
      });
      return {
        success: false,
        error: error.message || "Unknown error",
        type: error.type || ErrorTypes.UNKNOWN,
      };
    }
  }

  async handleImageTranslation(data) {
    const {
      imageData,
      from = "auto",
      to = "en",
      provider = "gemini",
      mode = "simple",
    } = data;

    if (!imageData) {
      throw new Error("Image data cannot be empty");
    }

    try {
      const backgroundService = globalThis.backgroundService; // Access the global background service
      if (!backgroundService || !backgroundService.translationEngine) {
        throw new Error(
          "Background service or translation engine not initialized.",
        );
      }

      const translatedText =
        await backgroundService.translationEngine.translateImage(
          imageData,
          from,
          to,
          provider,
          mode,
        );

      return {
        text: translatedText,
        sourceText: "[Image]",
        fromLanguage: from,
        toLanguage: to,
        provider: provider,
        mode: mode,
        timestamp: Date.now(),
        isImageTranslation: true,
      };
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.IMAGE_TRANSLATION,
        context: "handleImageTranslation",
        messageData: data,
      });
      throw new Error(`Image translation failed: ${error.message}`);
    }
  }

  // Provider management handlers
  async handleProviderStatus(data) {
    const { provider } = data;

    try {
      const backgroundService = globalThis.backgroundService; // Access the global background service
      if (!backgroundService || !backgroundService.translationEngine) {
        throw new Error(
          "Background service or translation engine not initialized.",
        );
      }

      const status =
        await backgroundService.translationEngine.getProviderStatus(provider);
      return status;
    } catch (error) {
      return {
        status: "error",
        message: error.message,
      };
    }
  }

  async handleTestProvider(data) {
    const { provider, config } = data;

    try {
      const backgroundService = globalThis.backgroundService; // Access the global background service
      if (!backgroundService || !backgroundService.translationEngine) {
        throw new Error(
          "Background service or translation engine not initialized.",
        );
      }

      const testResult = await backgroundService.translationEngine.testProvider(
        provider,
        config,
      );

      return {
        success: true,
        message: "Connection successful",
        testResult: testResult,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || "Connection failed",
      };
    }
  }

  async handleSaveProviderConfig(data) {
    const { provider, apiKey, customUrl, model } = data;

    try {
      const config = {
        apiKey,
        customUrl,
        model,
        timestamp: Date.now(),
      };

      // Store configuration securely
      await this.storeProviderConfig(provider, config);

      return {
        success: true,
        message: "Configuration saved",
      };
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.PROVIDER_CONFIG,
        context: "handleSaveProviderConfig",
        messageData: data,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async handleGetProviderConfig(data) {
    const { provider } = data;

    try {
      const config = await this.getStoredProviderConfig(provider);
      return {
        config: config || {},
      };
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.PROVIDER_CONFIG,
        context: "handleGetProviderConfig",
        messageData: data,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Screen capture handlers
  async handleStartScreenCapture(data, sender) {
    try {
      // Get active tab
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) {
        throw new Error("No active tab found");
      }

      // Send message to content script to start capture UI
      await browser.tabs.sendMessage(tab.id, {
        action: "START_SCREEN_CAPTURE",
        source: "background",
      });

      return {
        success: true,
        message: "Screen capture started",
      };
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SCREEN_CAPTURE,
        context: "handleStartScreenCapture",
        messageData: data,
      });
    }
  }

  async handleCaptureScreenArea(data) {
    const { coordinates } = data;

    try {
      // Capture visible tab
      const imageData = await browser.tabs.captureVisibleTab({
        format: "png",
      });

      // If coordinates are provided, we would crop the image here
      // For now, return the full screenshot
      return {
        imageData,
        coordinates,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SCREEN_CAPTURE,
        context: "handleCaptureScreenArea",
        messageData: data,
      });
    }
  }

  // Extension feature handlers
  async handleUpdateContextMenu(data) {
    const { menuItems } = data;

    try {
      // Remove existing context menu items
      await browser.contextMenus.removeAll();

      // Add new menu items
      if (menuItems && Array.isArray(menuItems)) {
        for (const item of menuItems) {
          await browser.contextMenus.create(item);
        }
      }

      return {
        success: true,
        message: "Context menu updated",
      };
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.CONTEXT_MENU,
        context: "handleUpdateContextMenu",
        messageData: data,
      });
    }
  }

  async handleGetExtensionInfo() {
    try {
      const manifest = browser.runtime.getManifest();

      return {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        permissions: manifest.permissions || [],
        id: browser.runtime.id,
      };
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.EXTENSION_INFO,
        context: "handleGetExtensionInfo",
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle error logging from frontend apps
   */
  async handleLogError(data) {
    try {
      const { error, context, info } = data;
      console.warn(`[${context}] Vue Error:`, error, info);

      // In production, you might want to send to a logging service
      // For now, just log to console and return success
      return {
        success: true,
        logged: true,
      };
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.LOGGING,
        context: "handleLogError",
        messageData: data,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Helper methods for storage
  async storeProviderConfig(provider, config) {
    const key = `provider_config_${provider}`;
    await browser.storage.local.set({ [key]: config });
  }

  async getStoredProviderConfig(provider) {
    const key = `provider_config_${provider}`;
    const result = await browser.storage.local.get(key);
    return result[key] || null;
  }

  // Method to register this handler with the existing message system
  async register() {
    // Registration is now handled by the MessageRouter in BackgroundService
    console.log(
      "[VueMessageHandler] Register method called, but actual registration is handled by MessageRouter.",
    );
  }
}
