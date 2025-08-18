// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import { LifecycleManager } from "../managers/core/LifecycleManager.js";
import { registerAllProviders } from "../providers/register-providers.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

// Import context menu click listener
import "./listeners/onContextMenuClicked.js";

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'index');

registerAllProviders();

const backgroundService = new LifecycleManager();
globalThis.backgroundService = backgroundService;

backgroundService.initialize().then(() => {
  logger.debug("✅ [Background] Background service initialization completed!");
}).catch((error) => {
  logger.error("❌ [Background] Background service initialization failed:", error);
});

export { backgroundService };

// Setup port-based reliable messaging endpoint
import browser from 'webextension-polyfill'
browser.runtime.onConnect.addListener((port) => {
  try {
    logger.debug('[Background] Port connected:', port.name);
    
    // Only handle ports we recognize
    if (!port.name || (!port.name.includes('reliable-messaging') && !port.name.includes('translation'))) {
      logger.debug('[Background] Ignoring unrecognized port:', port.name);
      return;
    }
    port.onMessage.addListener(async (msg) => {
      try {
        logger.debug('[Background] Port message received:', msg && msg.action, msg && msg.messageId);
        // Immediate ACK
        try { 
          port.postMessage({ type: 'ACK', messageId: msg.messageId || null }) 
        } catch (e) {
          logger.error('[Background] Failed to send ACK:', e);
        }

        const handler = backgroundService.messageHandler.getHandlerForMessage(msg.action, msg.context);

        if (handler) {
          const result = await handler(msg, port.sender);
          try {
            port.postMessage({ type: 'RESULT', messageId: msg.messageId, result });
          } catch (e) {
            logger.error('[Background] Failed to post RESULT to port', e);
          }
        } else {
          try {
            port.postMessage({ type: 'RESULT', messageId: msg.messageId, result: { success: false, error: `No handler for action: ${msg.action}` } });
          } catch (e) {
            logger.error('[Background] Failed to send no-handler RESULT:', e);
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
      logger.debug('[Background] Port disconnected:', port.name);
    });
  } catch (err) {
    logger.error('[Background] Error in onConnect handler:', err);
  }
});
