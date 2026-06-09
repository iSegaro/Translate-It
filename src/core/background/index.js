// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import browser from 'webextension-polyfill'
import { LifecycleManager } from "@/core/managers/core/LifecycleManager.js";
import { registerAllProviders } from "@/features/translation/providers/register-providers.js";
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { isDevelopmentMode } from '@/shared/utils/environment.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { handleInstallationEvent } from '@/handlers/lifecycle/InstallHandler.js';
import ExtensionContextManager from '@/core/extensionContext.js'
import { LiveCaptionBackgroundController } from '@/features/live-caption/background/LiveCaptionBackgroundController.js';

// Import context menu click listener
import "./listeners/onContextMenuClicked.js";

// Import notification click listener
import "./listeners/onNotificationClicked.js";

// Inject iframe-only content scripts after subframe DOM becomes available
import "./listeners/onSubframeDOMContentLoaded.js";

// Import Memory Garbage Collector
import { initializeGlobalCleanup } from '@/core/memory/GlobalCleanup.js';
import { startMemoryMonitoring } from '@/core/memory/MemoryMonitor.js';

// --- Diagnostic Logging ---
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'index');
const errorHandler = ErrorHandler.getInstance();

// --- Port Lifecycle Management ---

/**
 * Shared cleanup logic for UI ports (popup, sidepanel)
 */
async function performUiCleanup(context, sender) {
  // Exit early if extension context is invalidated to avoid "Extension context invalidated" errors
  if (!ExtensionContextManager.isValidSync()) {
    return;
  }

  logger.info(`[Background] Starting cleanup for context: ${context}`);
  
  try {
    if (globalThis.backgroundService?.initialized) {
      const service = globalThis.backgroundService;
      
      // 1. Stop all TTS when UI closes
      const ttsHandler = service.messageHandler.getHandlerForMessage('TTS_STOP');
      if (ttsHandler) {
        logger.debug(`[Background] Stopping TTS for ${context} closure`);
        await ttsHandler({ 
          action: 'TTS_STOP', 
          data: { 
            source: `${context}-port-disconnect`,
            stopOnlyIfOwner: true
          } 
        }, sender);
      }

      // 2. Cancel all active translations from UI
      const cancelHandler = service.messageHandler.getHandlerForMessage('CANCEL_TRANSLATION');
      if (cancelHandler) {
        logger.info(`[Background] Triggering CANCEL_TRANSLATION for context: ${context}`);
        await cancelHandler({
          action: 'CANCEL_TRANSLATION',
          data: { 
            cancelAll: true, 
            context: context,
            reason: `${context}_closed` 
          }
        }, sender);
      } else {
        // Fallback: directly call engine and queue manager
        if (service.translationEngine) {
          logger.info(`[Background] Fallback: Directly cancelling translations for context: ${context}`);
          await service.translationEngine.cancelAllTranslations(context);
          
          try {
            const { queueManager } = await import("@/features/translation/core/QueueManager.js");
            queueManager.cancelByUiContext(context);
          } catch { /* ignore */ }
        }
      }
    }
  } catch (error) {
    errorHandler.handle(error, {
      context: `background-cleanup-${context}`,
      showToast: false
    });
  }
}

// Register onConnect at the very top level for maximum reliability in Service Workers
const runtime = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome.runtime : browser.runtime;

runtime.onConnect.addListener((port) => {
  try {
    const isUiPort = port.name === 'popup-lifecycle' || port.name === 'sidepanel-lifecycle';
    
    if (isUiPort) {
      logger.info(`[Background] UI Port connected: ${port.name}`);
      const context = port.name === 'popup-lifecycle' ? 'popup' : 'sidepanel';
      
      port.onMessage.addListener((msg) => {
        if (msg.action === 'POPUP_OPENED' || msg.action === 'SIDEPANEL_OPENED') {
          logger.debug(`[Background] UI established connection: ${port.name}`);
        }
      });
      
      port.onDisconnect.addListener(() => {
        logger.info(`[Background] Port DISCONNECTED: ${port.name}`);
        performUiCleanup(context, port.sender).catch(err => {
          errorHandler.handle(err, {
            context: `background-port-disconnect-${context}`,
            showToast: false
          });
        });
      });
    }
  } catch (err) {
    errorHandler.handle(err, {
      context: 'background-onConnect',
      showToast: false
    });
  }
});

// --- Initialization ---

// Register all translation providers
registerAllProviders();

const backgroundService = new LifecycleManager();
globalThis.backgroundService = backgroundService;
const liveCaptionBackgroundController = new LiveCaptionBackgroundController();
backgroundService.liveCaptionBackgroundController = liveCaptionBackgroundController;
liveCaptionBackgroundController.registerHandlers(backgroundService.messageHandler);


// Handle extension installation
browser.runtime.onInstalled.addListener(async (details) => {
  try {
    await handleInstallationEvent(details);
  } catch (error) {
    logger.error('Failed to handle installation event:', error);
  }
});

// Initialize Background Service
backgroundService.initialize().then(async () => {
  logger.info("[Background] Background service initialization completed!");

  // Initialize DebugModeBridge for background script
  try {
    const { debugModeBridge } = await import('@/shared/logging/DebugModeBridge.js');
    await debugModeBridge.initialize();
    logger.info("[Background] DebugModeBridge initialized in background script");
  } catch (error) {
    logger.warn("[Background] Failed to initialize DebugModeBridge:", error);
  }

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

  // Initialize keyboard shortcuts listener
  if (browser.commands && browser.commands.onCommand) {
    // Import command handler dynamically and register listener
    (async function initializeShortcutsListener() {
      try {
        const { handleCommandEvent } = await import("@/handlers/command-handler.js");

        if (typeof handleCommandEvent === 'function') {
          // Register the command listener
          browser.commands.onCommand.addListener(async (command, tab) => {
            try {
              await handleCommandEvent(command, tab);
            } catch (error) {
              errorHandler.handle(error, {
                context: `background-command-${command}`,
                showToast: false
              });
            }
          });

          logger.info("Keyboard shortcuts listener registered successfully");
        }
      } catch (error) {
        errorHandler.handle(error, {
          context: 'background-shortcuts-init',
          showToast: false
        });
      }
    })();
  }

}).catch((error) => {
  errorHandler.handle(error, {
    context: 'background-init',
    showToast: false
  });
});

export { backgroundService };
