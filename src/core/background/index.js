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
    
    // Handle recognized messaging ports
    const recognizedPorts = ['reliable-messaging', 'smart-messaging', 'translation'];
    if (!port.name || !recognizedPorts.some(name => port.name.includes(name))) {
      logger.debug('[Background] Ignoring unrecognized port:', port.name);
      return;
    }
    // Manual disconnected flag for port
    port._disconnected = false;
    port.onMessage.addListener(async (msg) => {
      try {
        logger.debug('[Background] Port message received:', msg && msg.action, msg && msg.messageId);
        
        // Send immediate ACK for all port messages
        try { 
          port.postMessage({ type: 'ACK', messageId: msg.messageId || null }) 
          } catch (e) {
            logger.error('[Background] Failed to send ACK:', e);
          }

          // Wait for background service to be initialized before processing messages
          if (!backgroundService.initialized) {
            logger.debug('[Background] Background service not yet initialized, waiting...');
            
            // Wait up to 5 seconds for initialization
            let retries = 50;
            while (!backgroundService.initialized && retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
              retries--;
            }
            
            if (!backgroundService.initialized) {
              logger.error('[Background] Background service failed to initialize within timeout');
              if (port && port.postMessage && !port._disconnected) {
                port.postMessage({ 
                  type: 'RESULT', 
                  messageId: msg.messageId, 
                  result: { success: false, error: 'Background service not ready' } 
                });
              }
              return;
            }
            
            logger.debug('[Background] Background service initialized, proceeding with message handling');
          }

          const handler = backgroundService.messageHandler.getHandlerForMessage(msg.action, msg.context);

          if (handler) {
            const result = await handler(msg, port.sender);
            // Check if port is disconnected before sending RESULT (manual flag)
            if (port && port.postMessage && !port._disconnected) {
              port.postMessage({ type: 'RESULT', messageId: msg.messageId, result });
              logger.debug('[Background] RESULT sent to port successfully');
            } else {
              logger.debug('[Background] Port disconnected before RESULT could be sent');
            }
          } else {
            if (port && port.postMessage && !port._disconnected) {
              port.postMessage({ type: 'RESULT', messageId: msg.messageId, result: { success: false, error: `No handler for action: ${msg.action}` } });
            }
          }
        } catch (err) {
          logger.error('[Background] Error handling port message:', err);
          try {
            port.postMessage({ type: 'RESULT', messageId: msg.messageId, result: { success: false, error: err.message } });
          } catch (e) {
            logger.error('[Background] Failed to post error RESULT to port', e);
          }
        }
      });

      port.onDisconnect.addListener(() => {
        port._disconnected = true;
        logger.debug('[Background] Port disconnected:', port.name);
        
        // Handle runtime.lastError using centralized system
        ExtensionContextManager.handleRuntimeLastError('Background.onDisconnect.messaging')
      });
    } catch (err) {
      logger.error('[Background] Error in onConnect handler:', err);
    }
  });
