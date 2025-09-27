// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import { LifecycleManager } from "@/core/managers/core/LifecycleManager.js";
import { registerAllProviders } from "@/features/translation/providers/register-providers.js";
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { isDevelopmentMode } from '@/shared/utils/environment.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { handleInstallationEvent } from '@/handlers/lifecycle/InstallHandler.js';

// Import context menu click listener
import "./listeners/onContextMenuClicked.js";

// Import notification click listener
import "./listeners/onNotificationClicked.js";

// Import Memory Garbage Collector
import { initializeGlobalCleanup } from '@/core/memory/GlobalCleanup.js';
import { startMemoryMonitoring } from '@/core/memory/MemoryMonitor.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'index');
const errorHandler = ErrorHandler.getInstance();

registerAllProviders();

// Handle extension installation
browser.runtime.onInstalled.addListener(async (details) => {
  const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'onInstalled');

  try {
    await handleInstallationEvent(details);
  } catch (error) {
    logger.error('❌ Failed to handle installation event:', error);
  }
});

const backgroundService = new LifecycleManager();
globalThis.backgroundService = backgroundService;

backgroundService.initialize().then(() => {
  logger.info("[Background] Background service initialization completed!");

  // Initialize UnifiedTranslationService with dependencies
  unifiedTranslationService.initialize({
    translationEngine: backgroundService.translationEngine,
    backgroundService: backgroundService
  });
  logger.info("[Background] UnifiedTranslationService initialized!");

  // Initialize Memory Garbage Collector
  initializeGlobalCleanup();
  if (isDevelopmentMode()) {
    startMemoryMonitoring();
  }
  logger.info("[Background] Memory Garbage Collector initialized!");
  
}).catch((error) => {
  logger.error("❌ [Background] Background service initialization failed:", error);
});

export { backgroundService };

// Setup port-based reliable messaging endpoint
import browser from 'webextension-polyfill'
import ExtensionContextManager from '@/core/extensionContext.js'
browser.runtime.onConnect.addListener((port) => {
  try {
    logger.info('[Background] Port connected:', port.name);

    // Handle popup lifecycle port separately
    if (port.name === 'popup-lifecycle') {
      // Popup lifecycle port connected - logged at TRACE level for detailed debugging
      // logger.trace('[Background] Popup lifecycle port connected');
      
      port.onMessage.addListener((msg) => {
        if (msg.action === 'POPUP_OPENED') {
          // Popup opened - logged at TRACE level for detailed debugging
          // logger.trace('[Background] Popup opened at:', new Date(msg.data.timestamp));
        }
      });
      
      port.onDisconnect.addListener(async () => {
        // Popup port disconnected - logged at TRACE level for detailed debugging
        // logger.trace('[Background] Popup port disconnected - popup closed, stopping TTS');
        // Stop all TTS when popup closes
        try {
          if (!ExtensionContextManager.isValidSync()) {
            return; // Context invalid, skip silently - handled by ExtensionContextManager
          }

          if (backgroundService.initialized) {
            const handler = backgroundService.messageHandler.getHandlerForMessage('TTS_STOP');
            if (handler) {
              await handler({ 
                action: 'TTS_STOP', 
                data: { source: 'popup-port-disconnect' } 
              });
              // TTS stopped successfully - logged at TRACE level for detailed debugging
              // logger.trace('[Background] TTS stopped successfully on popup close');
            } else {
              // No handler found - logged at TRACE level for detailed debugging
              // logger.trace('[Background] No handler found for TTS_STOP');
            }
          } else {
            // Background service not initialized - logged at TRACE level for detailed debugging
            // logger.trace('[Background] Background service not initialized, skipping TTS stop on popup close');
          }
        } catch (error) {
          await errorHandler.handle(error, {
            context: 'background-popup-port-disconnect',
            showToast: false
          });
        }
      });
      
      return;
    }

    // Handle sidepanel lifecycle port separately
    if (port.name === 'sidepanel-lifecycle') {
      // Sidepanel lifecycle port connected - logged at TRACE level for detailed debugging
      // logger.trace('[Background] Sidepanel lifecycle port connected');
      
      port.onMessage.addListener((msg) => {
        if (msg.action === 'SIDEPANEL_OPENED') {
          // Sidepanel opened - logged at TRACE level for detailed debugging
          // logger.trace('[Background] Sidepanel opened at:', new Date(msg.data.timestamp));
        }
      });
      
      port.onDisconnect.addListener(async () => {
        // Sidepanel port disconnected - logged at TRACE level for detailed debugging
        // logger.trace('[Background] Sidepanel port disconnected - sidepanel closed, stopping TTS');
        // Stop all TTS when sidepanel closes
        try {
          if (!ExtensionContextManager.isValidSync()) {
            return; // Context invalid, skip silently - handled by ExtensionContextManager
          }

          if (backgroundService.initialized) {
            const handler = backgroundService.messageHandler.getHandlerForMessage('TTS_STOP');
            if (handler) {
              await handler({ 
                action: 'TTS_STOP', 
                data: { source: 'sidepanel-port-disconnect' } 
              });
              // TTS stopped successfully - logged at TRACE level for detailed debugging
              // logger.trace('[Background] TTS stopped successfully on sidepanel close');
            } else {
              // No handler found - logged at TRACE level for detailed debugging
              // logger.trace('[Background] No handler found for TTS_STOP');
            }
          } else {
            // Background service not initialized - logged at TRACE level for detailed debugging
            // logger.trace('[Background] Background service not initialized, skipping TTS stop on sidepanel close');
          }
        } catch (error) {
          await errorHandler.handle(error, {
            context: 'background-sidepanel-port-disconnect',
            showToast: false
          });
        }
      });
      
      return;
    }
    
    // Only handle lifecycle ports now (popup, sidepanel)
    // All messaging is now handled via direct runtime.sendMessage through UnifiedMessaging
    // Unrecognized port - logged at TRACE level for detailed debugging
    // logger.trace('[Background] Unrecognized port connection:', port.name, '- ignoring as UnifiedMessaging handles all messaging');
    } catch (err) {
      logger.error('[Background] Error in onConnect handler:', err);
    }
  });
