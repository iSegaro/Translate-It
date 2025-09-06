// Content script entry point for Vue build
// Modern modular architecture with organized handlers and shortcuts

import browser from "webextension-polyfill";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { checkContentScriptAccess } from "@/core/tabPermissions.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { sendSmart } from '@/shared/messaging/core/SmartMessaging.js';
// Import Main DOM CSS as raw string for injection
import mainDomCss from '@/assets/styles/content-main-dom.scss?inline';

// Import Memory Garbage Collector
import { initializeGlobalCleanup } from '@/core/memory/GlobalCleanup.js';
import { startMemoryMonitoring } from '@/core/memory/MemoryMonitor.js';


// Create logger for content script
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentScript');

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

    // Check if current page is excluded before initializing
    try {
      const response = await sendSmart({
        action: MessageActions.IS_Current_Page_Excluded,
        data: { url: window.location.href }
      });
      
      if (response?.excluded) {
        logger.info(`Content script stopped: page ${window.location.hostname} is excluded`);
        return; // Stop initialization if page is excluded
      }
    } catch (error) {
      logger.error('Failed to check page exclusion status:', error);
      // Continue with initialization on error to avoid breaking functionality
    }

    // Dynamically import modules based on frame context
    const { vueBridge } = await import("@/core/managers/content/VueBridgeManager.js");
    
    // Import core systems for both main frame and iframe
    const { getTranslationHandlerInstance } = await import("@/core/InstanceManager.js");
    const { selectElementManager } = await import("@/features/element-selection/managers/SelectElementManager.js");
    const { contentMessageHandler } = await import("@/handlers/content/ContentMessageHandler.js");
    
    // Import optional systems (main frame only or iframe-compatible)
    let shortcutManager = null;
    let subtitleInitializer = null;
    
    if (!isInIframe) {
      // Main frame exclusive systems
      const shortcutModule = await import("@/core/managers/content/shortcuts/ShortcutManager.js");
      shortcutManager = shortcutModule.shortcutManager;
      
      const subtitleModule = await import("@/core/managers/content/SubtitleInitializer.js");
      subtitleInitializer = subtitleModule.initializeSubtitleHandler;
    }

    // Initialize core systems
    const translationHandler = getTranslationHandlerInstance();
    const eventCoordinator = translationHandler.eventCoordinator; // Use existing instance

    // Store instances globally for handlers to access (with frame context)
    window.translationHandlerInstance = translationHandler;
    window.selectElementManagerInstance = selectElementManager;
    window.iFrameManagerInstance = iFrameManager;

    // Give ContentMessageHandler a reference to SelectElementManager and IFrameManager
    contentMessageHandler.setSelectElementManager(selectElementManager);
    contentMessageHandler.setIFrameManager(iFrameManager);

    // Initialize subtitle handler conditionally (main frame only)
    if (subtitleInitializer && !isInIframe) {
      await subtitleInitializer(translationHandler);
    }

    // Initialize core systems (both main frame and iframe)
    selectElementManager.initialize();
    contentMessageHandler.initialize();

    // Initialize TextFieldManager through EventCoordinator with iframe support
    if (eventCoordinator.textFieldManager) {
      eventCoordinator.textFieldManager.initialize({
        translationHandler: translationHandler,
        notifier: translationHandler.notifier,
        strategies: translationHandler.strategies,
        featureManager: translationHandler.featureManager,
        iFrameManager: iFrameManager,
        isInIframe: isInIframe
      });
    }

    // Initialize shortcut manager (main frame only)
    if (shortcutManager && !isInIframe) {
      shortcutManager.initialize({
        translationHandler: translationHandler,
        featureManager: translationHandler.featureManager
      });
    }

    // Setup DOM event listeners for EventCoordinator (text selection, text fields)
    document.addEventListener('mouseup', eventCoordinator.handleEvent, { passive: true });
    document.addEventListener('click', eventCoordinator.handleEvent, { passive: true });
    document.addEventListener('focus', eventCoordinator.handleEvent, { capture: true, passive: true });
    document.addEventListener('blur', eventCoordinator.handleEvent, { capture: true, passive: true });


    // Setup message listener integration with existing system
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {

      // Handle exclusion updates immediately
      if (message.action === MessageActions.Set_Exclude_Current_Page && message.data?.exclude) {
        logger.info('Page excluded via popup - disabling extension functionality');
        // Could add cleanup logic here if needed
        return Promise.resolve({ success: true });
      }

      // Handle async message processing
      const handleAsync = async () => {
        try {
          const wasHandled = await contentMessageHandler.handleMessage(message, sender, sendResponse);
          return wasHandled; // Return the actual handling result
        } catch (error) {
          logger.error('Message handling error:', error);
          if (sendResponse) {
            sendResponse({ success: false, error: error.message });
          }
          return true; // Indicate handled (even if error)
        }
      };

      // For async handlers, we need to return true and handle response manually
      if (contentMessageHandler.handlers.has(message.action)) {
        handleAsync();
        return true; // Keep message channel open for async response
      }

      return false; // Let other handlers process
    });

    // Final initialization summary with iframe context
    logger.init(`Content script initialized (${executionMode})`, {
      frameId: iFrameManager.frameId,
      isInIframe: isInIframe,
      messageHandlers: contentMessageHandler.getInfo?.()?.handlerCount || 0,
      shortcuts: shortcutManager?.getShortcutsInfo?.()?.shortcutCount || 0,
      vueBridge: vueBridge.isInitialized,
      ttsHandler: true,  // Using unified GOOGLE_TTS_SPEAK system
      iFrameSupport: true,
      registeredFrames: iFrameManager.getAllFrames().length
    });

    // Initialize Memory Garbage Collector with frame context
    initializeGlobalCleanup();
    startMemoryMonitoring();
    logger.debug(`✅ [Content Script] Memory Garbage Collector initialized! (${executionMode})`);
    
    // Final iframe manager setup
    logger.info(`🎯 [Content Script] IFrame support enabled - Frame ID: ${iFrameManager.frameId}`);
    
    })();
  }
  })(); // Close first async IIFE
}