// Content script entry point for Vue build
// Modern modular architecture with smart feature management

import browser from "webextension-polyfill";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { checkContentScriptAccess } from "@/core/tabPermissions.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { sendSmart } from '@/shared/messaging/core/SmartMessaging.js';
import { isDevelopmentMode } from '@/shared/utils/environment.js';
// Import Main DOM CSS as raw string for injection
import mainDomCss from '@/assets/styles/content-main-dom.scss?inline';

// Import Memory Garbage Collector
import { initializeGlobalCleanup } from '@/core/memory/GlobalCleanup.js';
import { startMemoryMonitoring } from '@/core/memory/MemoryMonitor.js';

// Import Feature Manager for smart handler registration
import { FeatureManager } from '@/core/managers/content/FeatureManager.js';

// Setup Trusted Types compatibility early
import { setupTrustedTypesCompatibility } from '@/shared/vue/vue-utils.js';
setupTrustedTypesCompatibility();


// Create logger for content script
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentScript');

/**
 * Legacy initialization fallback
 * Used when FeatureManager fails to initialize
 */
async function initializeLegacyHandlers() {
  logger.warn('Initializing legacy handlers as fallback...');
  
  try {
    // Import legacy modules
    const { getTranslationHandlerInstance } = await import("@/core/InstanceManager.js");
    const { selectElementManager } = await import("@/features/element-selection/managers/SelectElementManager.js");
    const { contentMessageHandler } = await import("@/handlers/content/ContentMessageHandler.js");
    
    // Initialize core systems
    const translationHandler = getTranslationHandlerInstance();
    
    // Store instances globally
    window.translationHandlerInstance = translationHandler;
    window.selectElementManagerInstance = selectElementManager;
    
    // Basic initialization
    await selectElementManager.initialize();
    contentMessageHandler.initialize();
    
    logger.info('Legacy handlers initialized successfully');
    
  } catch (error) {
    logger.error('Legacy initialization also failed:', error);
  }
}

/**
 * Inject CSS for Main DOM (outside Shadow DOM)
 * This ensures styles for Select Element Mode work on main page elements
 */
async function injectMainDOMStyles() {
  // Check if already injected
  if (document.getElementById('translate-it-main-dom-styles')) {
    return;
  }

  try {
    // Create style element with pre-compiled CSS
    const styleElement = document.createElement('style');
    styleElement.id = 'translate-it-main-dom-styles';
    styleElement.textContent = mainDomCss;
    
    // Inject to main document head
    document.head.appendChild(styleElement);
    
  } catch (error) {
    logger.error('Failed to inject Main DOM CSS:', error);
  }
}

// --- Early exit for restricted pages ---
const access = checkContentScriptAccess();

if (!access.isAccessible) {
  logger.warn(`Content script execution stopped: ${access.errorMessage}`);
  // Stop further execution by not initializing anything.
  // This prevents errors on pages like chrome://extensions or about:addons.
} else {
  // Use async IIFE to handle initialization
  (async () => {
    // Initialize IFrameManager for enhanced iframe support
    const { iFrameManager } = await import('@/features/iframe-support/managers/IFrameManager.js');
    
    // Determine execution mode based on frame context
    const isInIframe = window !== window.top;
    const executionMode = isInIframe ? 'iframe' : 'main-frame';
  
  if (window.translateItContentScriptLoaded) {
    // Stop further execution
  } else {
    window.translateItContentScriptLoaded = true;
    
    (async () => {
      logger.init(`Content script loading in ${executionMode}...`);

    // --- Inject Main DOM CSS (main frame only) ---
    if (!isInIframe) {
      await injectMainDOMStyles();
    }

    // --- Mount the Vue UI Host (required for both main frame and iframe) ---
    try {
      // Check if UI Host already exists in current frame
      const hostId = `translate-it-host-${isInIframe ? 'iframe' : 'main'}`;
      if (document.getElementById(hostId)) {
      } else {
        const { mountContentApp, getAppCss } = await import("@/app/main.js");
        const { pageEventBus } = await import("@/core/PageEventBus.js");
        
        // 2. Create the host element and shadow DOM with iframe awareness
        const hostElement = document.createElement('div');
        hostElement.id = hostId;
        hostElement.setAttribute('data-frame-type', executionMode);
        hostElement.style.all = 'initial';
        
        // Enhanced z-index and positioning for iframe contexts
        if (isInIframe) {
          hostElement.style.position = 'fixed';
          hostElement.style.top = '0';
          hostElement.style.left = '0';
          hostElement.style.width = '100vw';
          hostElement.style.height = '100vh';
          hostElement.style.pointerEvents = 'none';
          hostElement.style.zIndex = '2147483647';
        } else {
          hostElement.style.position = 'relative';
        }
        
        document.body.appendChild(hostElement);
        const shadowRoot = hostElement.attachShadow({ mode: 'open' });

        // 3. Inject the entire app's CSS into the shadow DOM with iframe awareness
        const appStyles = getAppCss();
        const appStyleEl = document.createElement('style');
        appStyleEl.setAttribute('data-vue-shadow-styles', 'true');
        appStyleEl.setAttribute('data-frame-context', executionMode);
        
        // Include all app styles with iframe-specific adjustments
        appStyleEl.textContent = `
          /* App styles with Shadow DOM reset included */
          ${appStyles}
          
          /* IFrame-specific adjustments */
          ${isInIframe ? `
          :host {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            pointer-events: none !important;
            z-index: 2147483647 !important;
          }
          
          .translation-icon {
            position: absolute !important;
            z-index: 2147483647 !important;
            pointer-events: all !important;
          }
          
          .translation-window {
            position: absolute !important;
            z-index: 2147483646 !important;
            pointer-events: all !important;
          }
          
          /* Ensure all interactive elements have pointer-events */
          .translation-icon *,
          .translation-window *,
          [data-vue-component] {
            pointer-events: all !important;
          }
          ` : ''}
        `;
        shadowRoot.appendChild(appStyleEl);
        

        // 4. Create the root element for the Vue app and mount it.
        const appRoot = document.createElement('div');
        shadowRoot.appendChild(appRoot);
        mountContentApp(appRoot);

        logger.info(`Vue UI Host mounted into Shadow DOM with all styles (${executionMode})`, {
          hostId,
          isInIframe,
          shadowRootMode: shadowRoot.mode,
          hostElementPosition: hostElement.style.position,
          hostElementZIndex: hostElement.style.zIndex
        });

        // Emit a test event to confirm communication
        setTimeout(() => {
          pageEventBus.emit('ui-host-mounted');
        }, 500);
      }

    } catch (error) {
      logger.error('Failed to mount the Vue UI Host:', error);
    }

    // Initialize Smart Feature Management System
    let featureManager = null;
    try {
      logger.info('Initializing Smart Feature Management System...');
      
      // Create and initialize FeatureManager
      featureManager = new FeatureManager();
      await featureManager.initialize();
      
      // Store for global access (mainly for debugging)
      if (isDevelopmentMode()) {
        window.featureManagerInstance = featureManager;
      }
      
      logger.info('Smart Feature Management System initialized successfully', {
        activeFeatures: featureManager.getActiveFeatures(),
        frameType: executionMode,
        debugMode: isDevelopmentMode()
      });

      // Setup the central message listener
      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const messageHandler = featureManager.getFeatureHandler('contentMessageHandler');

        // Check if the central handler has a specific handler for this action
        if (messageHandler && messageHandler.handlers.has(message.action)) {
          // If yes, let it handle the message and indicate an async response.
          messageHandler.handleMessage(message, sender, sendResponse);
          return true;
        }

        // Fallback for messages not handled by ContentMessageHandler
        if (message.action === MessageActions.SETTINGS_CHANGED) {
          logger.debug('Settings changed, refreshing feature manager');
          featureManager.manualRefresh().catch(error => {
            logger.error('Failed to refresh feature manager after settings change:', error);
          });
          // No async response needed, but we handled it.
          return;
        }

        if (message.action === MessageActions.Set_Exclude_Current_Page && message.data?.exclude) {
          logger.info('Page excluded via popup - disabling all features');
          featureManager.getActiveFeatures().forEach(feature => {
            featureManager.deactivateFeature(feature).catch(error => {
              logger.error(`Failed to deactivate feature ${feature}:`, error);
            });
          });
          // No async response needed, but we handled it.
          return;
        }

        // Message was not handled by any part of this listener.
        return false;
      });

    } catch (error) {
      logger.error('Failed to initialize Smart Feature Management System:', error);
      
      // Fallback to legacy initialization on error
      logger.warn('Falling back to legacy initialization...');
      await initializeLegacyHandlers();
    }

    // Final initialization summary with feature management context
    const initializationSummary = {
      frameId: iFrameManager.frameId,
      isInIframe: isInIframe,
      executionMode: executionMode,
      featureManagement: featureManager ? 'smart' : 'legacy',
      activeFeatures: featureManager ? featureManager.getActiveFeatures() : [],
      featureStatus: featureManager ? featureManager.getStatus() : null,
      iFrameSupport: true,
      registeredFrames: iFrameManager.getAllFrames().length
    };

    logger.init(`Content script initialized with Smart Feature Management (${executionMode})`, initializationSummary);

    // Initialize Memory Garbage Collector with frame context
    initializeGlobalCleanup();
    startMemoryMonitoring();
    logger.debug(`✅ [Content Script] Memory Garbage Collector initialized! (${executionMode})`);
    
    // Final iframe manager setup
    logger.info(`🎯 [Content Script] IFrame support enabled - Frame ID: ${iFrameManager.frameId}`);
    
    // Optional: Initialize EventCoordinator for backward compatibility if needed
    // Note: With Smart Handler Registration, EventCoordinator is mostly deprecated
    // but kept for legacy support
    if (featureManager && isDevelopmentMode()) {
      try {
        logger.debug('Initializing EventCoordinator for legacy compatibility...');
        const EventCoordinator = (await import('@/core/EventCoordinator.js')).default;
        const { getTranslationHandlerInstance } = await import("@/core/InstanceManager.js");
        
        const translationHandler = getTranslationHandlerInstance();
        const eventCoordinator = new EventCoordinator(translationHandler, featureManager);
        
        // Setup minimal event listeners for backward compatibility
        document.addEventListener('mouseup', eventCoordinator.handleEvent, { passive: true });
        document.addEventListener('click', eventCoordinator.handleEvent, { passive: true });
        document.addEventListener('focus', eventCoordinator.handleEvent, { capture: true, passive: true });
        document.addEventListener('blur', eventCoordinator.handleEvent, { capture: true, passive: true });
        document.addEventListener('keydown', eventCoordinator.handleKeyDown, { passive: true });
        document.addEventListener('keyup', eventCoordinator.handleKeyUp, { passive: true });
        
        window.eventCoordinatorInstance = eventCoordinator;
        logger.debug('EventCoordinator initialized for legacy compatibility');
        
      } catch (error) {
        logger.warn('Failed to initialize EventCoordinator (non-critical):', error);
      }
    }
    
    })();
  }
  })(); // Close first async IIFE
}