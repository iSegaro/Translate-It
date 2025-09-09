// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import { LifecycleManager } from "@/core/managers/core/LifecycleManager.js";
import { registerAllProviders } from "@/features/translation/providers/register-providers.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { isDevelopmentMode } from '@/shared/utils/environment.js';

// Import context menu click listener
import "./listeners/onContextMenuClicked.js";

// Import Memory Garbage Collector
import { initializeGlobalCleanup } from '@/core/memory/GlobalCleanup.js';
import { startMemoryMonitoring } from '@/core/memory/MemoryMonitor.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'index');

registerAllProviders();

const backgroundService = new LifecycleManager();
globalThis.backgroundService = backgroundService;

backgroundService.initialize().then(() => {
  logger.debug("✅ [Background] Background service initialization completed!");
  
  // Initialize Memory Garbage Collector
  initializeGlobalCleanup();
  if (isDevelopmentMode()) {
    startMemoryMonitoring();
  }
  logger.debug("✅ [Background] Memory Garbage Collector initialized!");
  
}).catch((error) => {
  logger.error("❌ [Background] Background service initialization failed:", error);
});

export { backgroundService };

// Setup port-based reliable messaging endpoint
import browser from 'webextension-polyfill'
import ExtensionContextManager from '@/core/extensionContext.js'
browser.runtime.onConnect.addListener((port) => {
  try {
    logger.debug('[Background] Port connected:', port.name);
    
    // Handle popup lifecycle port separately
    if (port.name === 'popup-lifecycle') {
      logger.debug('[Background] Popup lifecycle port connected');
      
      port.onMessage.addListener((msg) => {
        if (msg.action === 'POPUP_OPENED') {
          logger.debug('[Background] Popup opened at:', new Date(msg.data.timestamp));
        }
      });
      
      port.onDisconnect.addListener(async () => {
        logger.debug('[Background] Popup port disconnected - popup closed, stopping TTS');
        // Stop all TTS when popup closes
        try {
          // Check if background service is initialized
          if (backgroundService.initialized) {
            const handler = backgroundService.messageHandler.getHandlerForMessage('GOOGLE_TTS_STOP_ALL');
            if (handler) {
              await handler({ 
                action: 'GOOGLE_TTS_STOP_ALL', 
                data: { source: 'popup-port-disconnect' } 
              });
              logger.debug('[Background] TTS stopped successfully on popup close');
            } else {
              logger.warn('[Background] No handler found for GOOGLE_TTS_STOP_ALL');
            }
          } else {
            logger.debug('[Background] Background service not initialized, skipping TTS stop on popup close');
          }
        } catch (error) {
          logger.error('[Background] Failed to stop TTS on popup close:', error);
        }
      });
      
      return;
    }

    // Handle sidepanel lifecycle port separately
    if (port.name === 'sidepanel-lifecycle') {
      logger.debug('[Background] Sidepanel lifecycle port connected');
      
      port.onMessage.addListener((msg) => {
        if (msg.action === 'SIDEPANEL_OPENED') {
          logger.debug('[Background] Sidepanel opened at:', new Date(msg.data.timestamp));
        }
      });
      
      port.onDisconnect.addListener(async () => {
        logger.debug('[Background] Sidepanel port disconnected - sidepanel closed, stopping TTS');
        // Stop all TTS when sidepanel closes
        try {
          // Check if background service is initialized
          if (backgroundService.initialized) {
            const handler = backgroundService.messageHandler.getHandlerForMessage('GOOGLE_TTS_STOP_ALL');
            if (handler) {
              await handler({ 
                action: 'GOOGLE_TTS_STOP_ALL', 
                data: { source: 'sidepanel-port-disconnect' } 
              });
              logger.debug('[Background] TTS stopped successfully on sidepanel close');
            } else {
              logger.warn('[Background] No handler found for GOOGLE_TTS_STOP_ALL');
            }
          } else {
            logger.debug('[Background] Background service not initialized, skipping TTS stop on sidepanel close');
          }
        } catch (error) {
          logger.error('[Background] Failed to stop TTS on sidepanel close:', error);
        }
      });
      
      return;
    }
    
    // Only handle lifecycle ports now (popup, sidepanel)
    // All messaging is now handled via direct runtime.sendMessage through UnifiedMessaging
    logger.debug('[Background] Unrecognized port connection:', port.name, '- ignoring as UnifiedMessaging handles all messaging');
    } catch (err) {
      logger.error('[Background] Error in onConnect handler:', err);
    }
  });
