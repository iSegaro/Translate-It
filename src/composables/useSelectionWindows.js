// src/composables/useSelectionWindows.js
// Vue composable for SelectionWindows integration
// Bridges OLD SelectionWindows with Vue architecture

import { ref, reactive, onMounted, onUnmounted, readonly, computed } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { useI18n } from "./useI18n.js";
import SelectionWindows from "@/managers/SelectionWindows.js";
import { MessagingContexts } from "../core/MessagingStandards.js";
import { MessageActions } from "../core/MessageActions.js";

export function useSelectionWindows() {
  const { t } = useI18n();
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
        console.error("[useSelectionWindows] Mock error handler:", error, context);
        state.error = error.message || String(error);
      }
    }
  };

  // Mock notifier for SelectionWindows compatibility
  const mockNotifier = {
    show: (message, type, autoHide, duration) => {
      console.log(`[useSelectionWindows] Mock notification [${type}]: ${message}`);
      // In a full implementation, this could integrate with Vue toast system
    },
    dismiss: (id) => {
      console.log(`[useSelectionWindows] Mock notification dismissed: ${id}`);
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
        
        console.log("[useSelectionWindows] Showing selection window:", selectedText);
        
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
        
        console.log("[useSelectionWindows] Dismissing selection window");
        
        // Call original dismiss method
        originalDismiss(immediate);
      };

      console.log("[useSelectionWindows] SelectionWindows instance initialized");
      return selectionWindowsInstance;
    } catch (error) {
      console.error("[useSelectionWindows] Failed to initialize SelectionWindows:", error);
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
      console.error("[useSelectionWindows] Cannot show - instance not available");
      return false;
    }

    try {
      await instance.show(selectedText, position);
      return true;
    } catch (error) {
      console.error("[useSelectionWindows] Error showing selection window:", error);
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
      console.log("[useSelectionWindows] Cannot dismiss - no instance");
      return;
    }

    try {
      instance.dismiss(immediate);
    } catch (error) {
      console.error("[useSelectionWindows] Error dismissing selection window:", error);
      state.error = error.message;
    }
  };

  /**
   * Cancel current translation
   */
  const cancelCurrentTranslation = () => {
    const instance = selectionWindowsInstance;
    if (!instance) {
      console.log("[useSelectionWindows] Cannot cancel - no instance");
      return;
    }

    try {
      instance.cancelCurrentTranslation();
      state.isTranslating = false;
      state.error = null;
    } catch (error) {
      console.error("[useSelectionWindows] Error canceling translation:", error);
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
      console.log("[useSelectionWindows] Translation received:", state.translatedText.substring(0, 100) + "...");
    } else {
      state.error = response.error || "Translation failed";
      console.error("[useSelectionWindows] Translation error:", state.error);
    }
    
    state.isTranslating = false;
  };

  /**
   * Setup message listener for translation responses
   */
  const setupMessageListener = () => {
    const messageListener = (message, sender) => {
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
      console.warn("[useSelectionWindows] Failed to check settings:", error);
      return false;
    }
  };

  // Message listener cleanup function
  let messageListenerCleanup = null;

  // Setup on mount
  onMounted(() => {
    console.log("[useSelectionWindows] Component mounted, setting up...");
    
    // Setup message listener
    messageListenerCleanup = setupMessageListener();
    
    // Initialize instance (lazy loading)
    // Will be created when first needed via showSelectionWindow
  });

  // Cleanup on unmount
  onUnmounted(() => {
    console.log("[useSelectionWindows] Component unmounted, cleaning up...");
    
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
        console.warn("[useSelectionWindows] Error during cleanup dismiss:", error);
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