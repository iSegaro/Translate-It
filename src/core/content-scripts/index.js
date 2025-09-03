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
  // Only run in main frame (not in iframes)
  if (window !== window.top) {
    console.log('🚫 [Content Script] Running in iframe, skipping execution');
    // Stop execution in iframe
  } else if (window.translateItContentScriptLoaded) {
    console.warn('🚨 [Content Script] Already loaded, preventing duplicate execution');
    // Stop further execution
  } else {
    window.translateItContentScriptLoaded = true;
    
    console.log('🚀 [Content Script] ENTRY POINT REACHED');
    (async () => {
      console.log('🚀 [Content Script] ASYNC FUNCTION STARTED');
      logger.init("Content script loading...");

    // --- Inject Main DOM CSS ---
    await injectMainDOMStyles();

    // --- Mount the Vue UI Host ---
    try {
      // Check if UI Host already exists
      if (document.getElementById('translate-it-host')) {
        console.warn('[Content Script] ⚠️ UI Host already exists, skipping mount');
      } else {
        const { mountContentApp, getAppCss } = await import("@/app/main.js");
        const { pageEventBus } = await import("@/core/PageEventBus.js");
        
        // 2. Create the host element and shadow DOM.
        const hostElement = document.createElement('div');
        hostElement.id = 'translate-it-host';
        hostElement.style.all = 'initial';
        document.body.appendChild(hostElement);
        const shadowRoot = hostElement.attachShadow({ mode: 'open' });

        // 3. Inject the entire app's CSS into the shadow DOM.
        const appStyles = getAppCss();
        const appStyleEl = document.createElement('style');
        appStyleEl.setAttribute('data-vue-shadow-styles', 'true');
        
        // Include all app styles (Google Fonts removed to avoid CSP issues)
        appStyleEl.textContent = `
          /* App styles with Shadow DOM reset included */
          ${appStyles}
        `;
        shadowRoot.appendChild(appStyleEl);
        

        // 4. Create the root element for the Vue app and mount it.
        const appRoot = document.createElement('div');
        shadowRoot.appendChild(appRoot);
        mountContentApp(appRoot);

        logger.info('Vue UI Host mounted into Shadow DOM with all styles.');

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

    // Dynamically import modules only on accessible and non-excluded pages
    const { vueBridge } = await import("@/core/managers/content/VueBridgeManager.js");
    // TTS handler removed - using unified GOOGLE_TTS_SPEAK system
    const { getTranslationHandlerInstance } = await import("@/core/InstanceManager.js");
    const { selectElementManager } = await import("@/features/element-selection/managers/SelectElementManager.js");
    const { contentMessageHandler } = await import("@/handlers/content/ContentMessageHandler.js");
    const { shortcutManager } = await import("@/core/managers/content/shortcuts/ShortcutManager.js");
    const { initializeSubtitleHandler } = await import("@/core/managers/content/SubtitleInitializer.js");

    // Initialize core systems
    const translationHandler = getTranslationHandlerInstance();
    const eventCoordinator = translationHandler.eventCoordinator; // Use existing instance

    // Store instances globally for handlers to access
    window.translationHandlerInstance = translationHandler;
    window.selectElementManagerInstance = selectElementManager;

    // Give ContentMessageHandler a reference to SelectElementManager
    contentMessageHandler.setSelectElementManager(selectElementManager);

    // Initialize subtitle handler conditionally
    await initializeSubtitleHandler(translationHandler);

    // Initialize all systems
    selectElementManager.initialize();
    contentMessageHandler.initialize();

    // Initialize TextFieldManager through EventCoordinator with proper dependencies
    eventCoordinator.textFieldManager.initialize({
      translationHandler: translationHandler,
      notifier: translationHandler.notifier,
      strategies: translationHandler.strategies,
      featureManager: translationHandler.featureManager
    });

    // Initialize shortcut manager with required dependencies
    shortcutManager.initialize({
      translationHandler: translationHandler,
      featureManager: translationHandler.featureManager
    });

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

    // Final initialization summary
    logger.init('Content script initialized', {
      messageHandlers: contentMessageHandler.getInfo?.()?.handlerCount || 0,
      shortcuts: shortcutManager.getShortcutsInfo?.()?.shortcutCount || 0,
      vueBridge: vueBridge.isInitialized,
      ttsHandler: true  // Using unified GOOGLE_TTS_SPEAK system
    });

    // Initialize Memory Garbage Collector
    initializeGlobalCleanup();
    startMemoryMonitoring();
    logger.debug("✅ [Content Script] Memory Garbage Collector initialized!");
    
    })();
  }
}