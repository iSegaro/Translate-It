// src/composables/useSelectionWindows.js
// Vue composable for SelectionWindows integration
// Bridges OLD SelectionWindows with Vue architecture

import { reactive, onMounted, onUnmounted, computed } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import SelectionWindows from "@/managers/content/WindowsManager.js";
import { MessagingContexts } from "../messaging/core/MessagingCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('UI', 'useSelectionWindows');

export function useSelectionWindows() {
  const browserAPI = useBrowserAPI();

  // Reactive state
  const state = reactive({
    isVisible: false,
    isIconMode: false,
    selectedText: "",
    position: null,
    isTranslating: false,
    translatedText: "",
    error: null,
  });

  // SelectionWindows instance (OLD)
  let selectionWindowsInstance = null;

  // Mock translation handler for SelectionWindows compatibility
  const mockTranslationHandler = {
    // SelectionWindows doesn't actually use these methods directly
    // but needs them for constructor compatibility
    errorHandler: {
      handle: (error, context) => {
        logger.error("[useSelectionWindows] Mock error handler:", error, context);
        state.error = error.message || String(error);
      }
    }
  };

  // Mock notifier for SelectionWindows compatibility
  const mockNotifier = {
    show: (message, type) => {
      logger.debug(`[useSelectionWindows] Mock notification [${type}]: ${message}`);
      // In a full implementation, this could integrate with Vue toast system
    },
    dismiss: (id) => {
      logger.debug(`[useSelectionWindows] Mock notification dismissed: ${id}`);
    }
  };

  /**
   * Initialize SelectionWindows instance
   */
  const initializeSelectionWindows = () => {
    if (selectionWindowsInstance) {
      return selectionWindowsInstance;
    }

    try {
      selectionWindowsInstance = new SelectionWindows({
        translationHandler: mockTranslationHandler,
        notifier: mockNotifier,
        fadeInDuration: 50,
        fadeOutDuration: 125,
      });

      // Override some methods to integrate with Vue state
      const originalShow = selectionWindowsInstance.show.bind(selectionWindowsInstance);
      selectionWindowsInstance.show = async (selectedText, position) => {
        state.selectedText = selectedText;
        state.position = position;
        state.isVisible = true;
        state.error = null;
        
        logger.debug("[useSelectionWindows] Showing selection window:", selectedText);
        
        // Call original show method
        await originalShow(selectedText, position);
        
        // Update state based on mode
        state.isIconMode = selectionWindowsInstance.isIconMode;
      };

      const originalDismiss = selectionWindowsInstance.dismiss.bind(selectionWindowsInstance);
      selectionWindowsInstance.dismiss = (immediate = true) => {
        state.isVisible = false;
        state.selectedText = "";
        state.position = null;
        state.translatedText = "";
        state.error = null;
        
        logger.debug("[useSelectionWindows] Dismissing selection window");
        
        // Call original dismiss method
        originalDismiss(immediate);
      };

      logger.debug("[useSelectionWindows] SelectionWindows instance initialized");
      return selectionWindowsInstance;
    } catch (error) {
      logger.error("[useSelectionWindows] Failed to initialize SelectionWindows:", error);
      state.error = error.message;
      return null;
    }
  };

  /**
   * Show selection window with text and position
   */
  const showSelectionWindow = async (selectedText, position) => {
    const instance = initializeSelectionWindows();
    if (!instance) {
      logger.error("[useSelectionWindows] Cannot show - instance not available");
      return false;
    }

    try {
      await instance.show(selectedText, position);
      return true;
    } catch (error) {
      logger.error("[useSelectionWindows] Error showing selection window:", error);
      state.error = error.message;
      return false;
    }
  };

  /**
   * Dismiss selection window
   */
  const dismissSelectionWindow = (immediate = true) => {
    const instance = selectionWindowsInstance;
    if (!instance) {
      logger.debug("[useSelectionWindows] Cannot dismiss - no instance");
      return;
    }

    try {
      instance.dismiss(immediate);
    } catch (error) {
      logger.error("[useSelectionWindows] Error dismissing selection window:", error);
      state.error = error.message;
    }
  };

  /**
   * Cancel current translation
   */
  const cancelCurrentTranslation = () => {
    const instance = selectionWindowsInstance;
    if (!instance) {
      logger.debug("[useSelectionWindows] Cannot cancel - no instance");
      return;
    }

    try {
      instance.cancelCurrentTranslation();
      state.isTranslating = false;
      state.error = null;
    } catch (error) {
      logger.error("[useSelectionWindows] Error canceling translation:", error);
      state.error = error.message;
    }
  };

  /**
   * Handle translation response from background
   */
  const handleTranslationResponse = (response) => {
    if (!response) {
      state.error = "No translation response received";
      state.isTranslating = false;
      return;
    }

    if (response.success) {
      state.translatedText = response.data?.translatedText || "";
      state.error = null;
      logger.debug("[useSelectionWindows] Translation received:", state.translatedText.substring(0, 100) + "...");
    } else {
      state.error = response.error || "Translation failed";
      logger.error("[useSelectionWindows] Translation error:", state.error);
    }
    
    state.isTranslating = false;
  };

  /**
   * Setup message listener for translation responses
   */
  const setupMessageListener = () => {
    const messageListener = (message) => {
      // Only handle translation response messages
      if (message.action === MessageActions.TRANSLATION_COMPLETE && message.context === MessagingContexts.SELECTION_MANAGER) {
        handleTranslationResponse(message);
      }
    };

    browserAPI.onMessage.addListener(messageListener);
    
    return () => {
      browserAPI.onMessage.removeListener(messageListener);
    };
  };

  /**
   * Check if selection window should be shown based on settings
   */
  const shouldShowSelectionWindow = async () => {
    try {
      const settings = await browserAPI.safeStorageGet([
        "TRANSLATE_ON_TEXT_SELECTION",
        "selectionTranslationMode"
      ]);
      
      return settings.TRANSLATE_ON_TEXT_SELECTION && 
             (settings.selectionTranslationMode === "immediate" || 
              settings.selectionTranslationMode === "onClick");
    } catch (error) {
      logger.warn("[useSelectionWindows] Failed to check settings:", error);
      return false;
    }
  };

  // Message listener cleanup function
  let messageListenerCleanup = null;

  // Setup on mount
  onMounted(() => {
    logger.debug("[useSelectionWindows] Component mounted, setting up...");
    
    // Setup message listener
    messageListenerCleanup = setupMessageListener();
    
    // Initialize instance (lazy loading)
    // Will be created when first needed via showSelectionWindow
  });

  // Cleanup on unmount
  onUnmounted(() => {
    logger.debug("[useSelectionWindows] Component unmounted, cleaning up...");
    
    // Cleanup message listener
    if (messageListenerCleanup) {
      messageListenerCleanup();
      messageListenerCleanup = null;
    }
    
    // Dismiss any visible windows
    if (selectionWindowsInstance) {
      try {
        selectionWindowsInstance.dismiss(true);
      } catch (error) {
        logger.warn("[useSelectionWindows] Error during cleanup dismiss:", error);
      }
      selectionWindowsInstance = null;
    }
  });

  // Public API
  return {
    // State (readonly computed for external components)
    isVisible: computed(() => state.isVisible),
    isIconMode: computed(() => state.isIconMode),
    selectedText: computed(() => state.selectedText),
    position: computed(() => state.position),
    isTranslating: computed(() => state.isTranslating),
    translatedText: computed(() => state.translatedText),
    error: computed(() => state.error),

    // Methods
    showSelectionWindow,
    dismissSelectionWindow,
    cancelCurrentTranslation,
    shouldShowSelectionWindow,
    
    // Direct access to instance (for advanced usage)
    getInstance: () => selectionWindowsInstance,
  };
}