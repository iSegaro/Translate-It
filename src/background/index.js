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
    port.onMessage.addListener(async (msg) => {
      try {
        logger.debug('[Background] Port message received:', msg && msg.action, msg && msg.messageId);
        // Immediate ACK
        try { port.postMessage({ type: 'ACK', messageId: msg.messageId || null }) } catch (e) {}

        // Handle TRANSLATE action directly via translationEngine
        if (msg && msg.action === 'TRANSLATE') {
          if (backgroundService && backgroundService.translationEngine) {
            const result = await backgroundService.translationEngine.handleTranslateMessage(msg, null);
            // Send final result
            try {
              port.postMessage({ type: 'RESULT', messageId: msg.messageId, result });
            } catch (e) {
              logger.error('[Background] Failed to post RESULT to port', e);
            }
          } else {
            port.postMessage({ type: 'RESULT', messageId: msg.messageId, result: { success: false, error: 'Translation engine unavailable' } });
          }
        }
      } catch (err) {
        logger.error('[Background] Error handling port message:', err);
      }
    });

    port.onDisconnect.addListener(() => {
      logger.debug('[Background] Port disconnected:', port.name);
    });
  } catch (err) {
    logger.error('[Background] Error in onConnect handler:', err);
  }
});
