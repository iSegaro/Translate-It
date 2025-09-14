// Content script entry point for Vue build
// Modern modular architecture with smart feature management

// import browser from "webextension-polyfill";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { checkContentScriptAccess } from "@/core/tabPermissions.js";
// import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
// import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { isDevelopmentMode } from '@/shared/utils/environment.js';
import { createMessageHandler } from '@/shared/messaging/core/MessageHandler.js';
// Import Main DOM CSS as raw string for injection
import mainDomCss from '@/assets/styles/content-main-dom.scss?inline';

// Import Memory Garbage Collector
import { initializeGlobalCleanup } from '@/core/memory/GlobalCleanup.js';
import { startMemoryMonitoring } from '@/core/memory/MemoryMonitor.js';

// Import Feature Manager for smart handler registration
import { FeatureManager } from '@/core/managers/content/FeatureManager.js';
import ExtensionContextManager from '@/core/extensionContext.js';

// Import Field Detection System for global availability
// import { fieldDetector } from '@/utils/text/FieldDetector.js';
// import { selectionDetector } from '@/utils/text/SelectionDetector.js';

// Import Notification System
import NotificationManager from '@/core/managers/core/NotificationManager.js';

// Setup Trusted Types compatibility early
import { setupTrustedTypesCompatibility } from '@/shared/vue/vue-utils.js';
setupTrustedTypesCompatibility();


// Create logger for content script
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentScript');

// Global extension context validation helper
function validateExtensionContext(operation = 'unknown') {
  if (!ExtensionContextManager.isValidSync()) {
    logger.debug(`Extension context invalid - ${operation} skipped`);
    return false;
  }
  return true;
}


/**
 * Legacy initialization fallback
 * Used when FeatureManager fails to initialize
 */
async function initializeLegacyHandlers() {
  // Validate extension context before legacy initialization
  if (!validateExtensionContext('legacy-initialization')) {
    return;
  }

  logger.warn('Initializing legacy handlers as fallback...');

  try {
    // Legacy initialization is now handled by FeatureManager
    // Import only what's needed for backward compatibility
    const { getTranslationHandlerInstance } = await import("@/core/InstanceManager.js");
    const { contentMessageHandler } = await import("@/handlers/content/index.js");

    // Initialize core systems
    const translationHandler = getTranslationHandlerInstance();

    // Store instances globally (for legacy compatibility)
    window.translationHandlerInstance = translationHandler;
    window.contentMessageHandler = contentMessageHandler;
    // Note: selectElementManagerInstance is no longer available - use FeatureManager instead

    // Get message handler
    const messageHandler = createMessageHandler();

    // Register all ContentMessageHandler handlers with the central message handler
    if (contentMessageHandler.handlers) {
      for (const [action, handler] of contentMessageHandler.handlers.entries()) {
        messageHandler.registerHandler(action, async (message, sender) => {
          try {
            // Call the handler directly and return the result
            const result = await handler.call(contentMessageHandler, message, sender);
            return result;
          } catch (error) {
            logger.error(`Error in legacy content handler for ${action}:`, error);
            throw error;
          }
        });
      }
      logger.debug('Registered legacy content message handlers:', Array.from(contentMessageHandler.handlers.keys()));
    }
    
    // Activate the message listener
    if (!messageHandler.isListenerActive) {
      messageHandler.listen();
      logger.debug('Legacy message handler activated');
    }
    
    // Store message handler globally for cleanup
    window.legacyMessageHandler = messageHandler;
    
    logger.info('Legacy handlers initialized successfully with proper message handling');
    
  } catch (error) {
    // Handle context errors silently
    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, 'legacy-initialization');
    } else {
      logger.error('Legacy initialization also failed:', error);
    }
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

  // Validate extension context before DOM operations
  if (!validateExtensionContext('main-dom-css-injection')) {
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

logger.debug('Content script access check result:', {
  isAccessible: access.isAccessible,
  errorMessage: access.errorMessage,
  url: window.location.href,
  isInIframe: window !== window.top
});

if (!access.isAccessible) {
  logger.warn(`Content script execution stopped: ${access.errorMessage}`);
  // Stop further execution by not initializing anything.
  // This prevents errors on pages like chrome://extensions or about:addons.
} else {
  // Use async IIFE to handle initialization
  (async () => {
    // Validate extension context before any operations
    if (!validateExtensionContext('content-script-initialization')) {
      return;
    }
    // Initialize IFrameManager for enhanced iframe support
    const { iFrameManager } = await import('@/features/iframe-support/managers/IFrameManager.js');
    
    // Determine execution mode based on frame context
    const isInIframe = window !== window.top;
    const executionMode = isInIframe ? 'iframe' : 'main-frame';
  
  if (window.translateItContentScriptLoaded) {
    logger.debug('Content script already loaded, stopping duplicate execution');
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
        // UI Host already exists
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

        // Initialize Notification System for Select Element
        setTimeout(async () => {
          try {
            const notificationManager = new NotificationManager();
            
            // Initialize SelectElementNotificationManager for unified notification handling
            const { getSelectElementNotificationManager } = await import('@/features/element-selection/SelectElementNotificationManager.js');
            await getSelectElementNotificationManager(notificationManager);
            
            logger.debug('Notification System initialized for Select Element');
          } catch (error) {
            logger.error('Failed to initialize Notification System:', error);
          }
        }, 100);

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
      logger.info('🚀 [Content Script] Starting Smart Feature Management System initialization...');
      
      // Create and initialize FeatureManager
      featureManager = new FeatureManager();

      // FeatureManager manages handlers - individual handlers handle their own Critical Protection
      featureManager.trackResource('feature-manager-core', () => {
        logger.debug('FeatureManager core cleanup called');
        // FeatureManager itself is not critical - individual handlers manage their own protection
      });

      await featureManager.initialize();

      // Store for global access (mainly for debugging and memory protection)
      if (isDevelopmentMode()) {
        window.featureManagerInstance = featureManager;
      }
      // Also store globally for memory protection
      window.featureManager = featureManager;
      
      logger.info('Smart Feature Management System initialized successfully', {
        activeFeatures: featureManager.getActiveFeatures(),
        frameType: executionMode,
        debugMode: isDevelopmentMode()
      });

      // FeatureManager handles all message handler registration through smart feature management
      // ContentMessageHandler and other features are activated based on settings and exclusions
      logger.debug('Smart feature management system will handle message handler registration');

    } catch (error) {
      logger.error('❌ [Content Script] Smart Feature Management System failed:', error);
      logger.error('❌ [Content Script] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        url: window.location.href
      });
      
      // Fallback to legacy initialization on error
      logger.warn('⚠️ [Content Script] Falling back to legacy initialization...');
      await initializeLegacyHandlers();
    }
    
    logger.debug('Content script initialization complete', {
      featureManagement: featureManager ? 'smart' : 'legacy',
      activeFeatures: featureManager ? featureManager.getActiveFeatures() : []
    });
    
    // Cleanup legacy message handler if smart initialization succeeded
    if (featureManager && window?.legacyMessageHandler) {
      logger.debug('Cleaning up legacy message handler - smart initialization succeeded');
      window.legacyMessageHandler.stopListening();
      window.legacyMessageHandler = null;
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
    
    // EventCoordinator disabled - modern FeatureManager system handles all events
    // The EventCoordinator was causing duplicate event processing with the new selection event strategy system
    // All event handling is now properly managed through TextSelectionHandler and other feature handlers
    logger.debug('EventCoordinator disabled - using modern FeatureManager event handling');
    })();
  }
  })(); // Close first async IIFE
}