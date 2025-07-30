// src/composables/useSelectElementTranslation.js
// Vue composable for Select Element Translation Mode
// Integrates with existing background script handlers

import { ref, reactive, onMounted, onUnmounted, readonly } from "vue";
import { useI18n } from "./useI18n.js";
import { useBrowserAPI } from "./useBrowserAPI.js";

export function useSelectElementTranslation() {
  const { t } = useI18n();
  const browserAPI = useBrowserAPI();

  // Reactive state following Plan1.md architecture
  const state = reactive({
    isActivating: false, // در حال فعال‌سازی mode
    isSelecting: false, // mode فعال، منتظر انتخاب
    selectedElement: null, // element انتخاب شده
    extractedText: "", // متن استخراج شده
    error: null, // خطاهای احتمالی
  });

  const isSelectModeActive = ref(false); // New state for overall mode status

  // Event emitter for parent components
  const onTextExtracted = ref(null);
  const onModeChanged = ref(null);

  // Timeout management
  const selectionTimeout = ref(null);
  const SELECTION_TIMEOUT_MS = 30000; // 30 seconds

  // Helper for retrying sendMessage
  const sendMessageWithRetry = async (
    action,
    data,
    retries = 3,
    delayMs = 100,
  ) => {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`[useSelectElementTranslation] Sending message:`, {
          action,
          data,
        });
        const response = await browserAPI.safeSendMessage({ action, data });
        console.log(
          `[useSelectElementTranslation] Received response:`,
          response,
        );

        if (response?.success) {
          console.log(
            `[useSelectElementTranslation] Response successful:`,
            response,
          );
          return response;
        } else {
          console.warn(
            `[useSelectElementTranslation] Response failed:`,
            response,
          );
          // If response indicates failure, but not a port closed error, re-throw immediately
          if (
            response?.error &&
            !response.error.includes("message port closed") &&
            !response.error.includes("Could not establish connection")
          ) {
            throw new Error(response.error);
          }
          // Otherwise, it's a port closed error, retry
          throw new Error(
            `Retryable error: ${response?.error || "No success response"}`,
          );
        }
      } catch (error) {
        console.warn(
          `[useSelectElementTranslation] Message send failed (attempt ${i + 1}/${retries}):`,
          error,
        );
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          throw error; // Re-throw after last retry
        }
      }
    }
  };

  /**
   * فعال‌سازی Select Element Mode
   * مطابق با Plan1.md و OLD implementation integration
   */
  const activateSelectElement = async () => {
    state.isActivating = true;
    state.error = null;

    try {
      console.log(
        "[useSelectElementTranslation] Activating select element mode",
      );

      // First update storage to sync with OLD system
      try {
        await browserAPI.safeStorageSet({ selectElementState: true });
        console.log("[useSelectElementTranslation] Storage updated: selectElementState = true");
      } catch (storageError) {
        console.warn("[useSelectElementTranslation] Failed to set selectElementState:", storageError);
      }

      const response = await sendMessageWithRetry(
        "activateSelectElementMode",
        true,
      );

      if (response?.success) {
        state.isSelecting = true;
        isSelectModeActive.value = true;
        
        console.log("[useSelectElementTranslation] Select element mode activated successfully");

        // Timeout disabled - let EventHandler manage the complete process like in OLD version
        startSelectionTimeout();

        // اطلاع‌رسانی به parent component
        if (onModeChanged.value) {
          onModeChanged.value(true);
        }
      } else {
        // If background fails, revert storage
        await browserAPI.safeStorageSet({ selectElementState: false }).catch(() => {});
        throw new Error(
          response?.error || "Failed to activate select element mode",
        );
      }
    } catch (error) {
      console.error("[useSelectElementTranslation] Activation error:", error);
      state.error = error.message;
      
      // Ensure storage is reverted on error
      await browserAPI.safeStorageSet({ selectElementState: false }).catch(() => {});
      
      handleSelectElementError(error);
    } finally {
      state.isActivating = false;
    }
  };

  /**
   * غیرفعال‌سازی Select Element Mode
   */
  const deactivateSelectElement = async () => {
    state.isActivating = true;
    state.error = null;

    try {
      console.log(
        "[useSelectElementTranslation] Deactivating select element mode",
      );

      // First update storage to sync with OLD system
      try {
        await browserAPI.safeStorageSet({ selectElementState: false });
        console.log("[useSelectElementTranslation] Storage updated: selectElementState = false");
      } catch (storageError) {
        console.warn("[useSelectElementTranslation] Failed to set selectElementState:", storageError);
      }

      const response = await sendMessageWithRetry(
        "activateSelectElementMode",
        false,
      );

      if (response?.success) {
        state.isSelecting = false;
        isSelectModeActive.value = false;
        state.selectedElement = null;
        state.extractedText = "";
        state.error = null;

        // پاکسازی timeout
        clearSelectionTimeout();

        console.log("[useSelectElementTranslation] Select element mode deactivated successfully");

        // اطلاع‌رسانی به parent component
        if (onModeChanged.value) {
          onModeChanged.value(false);
        }
      } else {
        console.warn("[useSelectElementTranslation] Background deactivation failed, but storage already updated");
        // Don't throw error - storage is already updated, UI state should reflect this
        state.isSelecting = false;
        isSelectModeActive.value = false;
        clearSelectionTimeout();
        
        if (onModeChanged.value) {
          onModeChanged.value(false);
        }
      }
    } catch (error) {
      console.error("[useSelectElementTranslation] Deactivation error:", error);
      
      // Even on error, ensure UI state is consistent with storage
      state.isSelecting = false;
      isSelectModeActive.value = false;
      clearSelectionTimeout();
      
      state.error = error.message;
      
      if (onModeChanged.value) {
        onModeChanged.value(false);
      }
    } finally {
      state.isActivating = false;
    }
  };

  /**
   * تغییر وضعیت Select Element Mode (toggle)
   */
  const toggleSelectElement = async () => {
    if (isSelectModeActive.value) {
      // Use isSelectModeActive for toggle logic
      await deactivateSelectElement();
    } else {
      await activateSelectElement();
    }
  };

  /**
   * شروع timeout برای selection - DISABLED to match OLD behavior
   */
  const startSelectionTimeout = () => {
    // Disabled timeout - let EventHandler complete the translation process
    console.log("[useSelectElementTranslation] Timeout disabled - EventHandler will manage the process");
  };

  /**
   * پاکسازی timeout
   */
  const clearSelectionTimeout = () => {
    if (selectionTimeout.value) {
      clearTimeout(selectionTimeout.value);
      selectionTimeout.value = null;
    }
  };

  /**
   * مدیریت انتخاب element از content script
   * مطابق با Plan1.md flow
   */
  const handleElementSelected = async (elementData) => {
    console.log("[useSelectElementTranslation] Element selected:", elementData);

    // پاکسازی timeout
    clearSelectionTimeout();

    state.selectedElement = elementData;
    state.extractedText = elementData.text || "";
    state.isSelecting = false;
    isSelectModeActive.value = false; // همگام‌سازی toggle state
    state.error = null; // پاکسازی خطاهای قبلی

    // همگام‌سازی با storage
    try {
      await browserAPI.safeStorageSet({ selectElementState: false });
    } catch (error) {
      console.warn(
        "[useSelectElementTranslation] Failed to update storage:",
        error,
      );
    }

    // اطلاع‌رسانی به parent component برای populate کردن form
    if (onTextExtracted.value && state.extractedText) {
      onTextExtracted.value(state.extractedText, elementData);
    }

    // اطلاع‌رسانی تغییر mode
    if (onModeChanged.value) {
      onModeChanged.value(false);
    }
  };

  /**
   * مدیریت خطاهای Select Element
   * مطابق با Plan1.md Error Handling Strategy
   */
  const handleSelectElementError = (error) => {
    console.error("[useSelectElementTranslation] Error:", error);

    // پاکسازی timeout
    clearSelectionTimeout();

    // Reset state
    state.isActivating = false;
    state.isSelecting = false;

    // تشخیص نوع خطا و نمایش پیام مناسب
    let errorMessage = t(
      "SELECT_ELEMENT_GENERIC_ERROR",
      "An error occurred while activating select mode",
    );

    if (
      error.message?.includes("permission") ||
      error.message?.includes("Permission")
    ) {
      errorMessage = t(
        "SELECT_ELEMENT_PERMISSION_ERROR",
        "Permission denied. Please reload the page and try again.",
      );
    } else if (
      error.message?.includes("timeout") ||
      error.message?.includes("Selection timeout")
    ) {
      errorMessage = t(
        "SELECT_ELEMENT_TIMEOUT",
        "Selection timeout. No element was selected within 30 seconds.",
      );
    } else if (
      error.message?.includes("tab") ||
      error.message?.includes("Tab")
    ) {
      errorMessage = t(
        "SELECT_ELEMENT_TAB_ERROR",
        "Cannot access current tab. Please try again.",
      );
    }

    // تنظیم پیام خطا
    state.error = errorMessage;

    // اطلاع‌رسانی تغییر mode
    if (onModeChanged.value) {
      onModeChanged.value(false);
    }

    // Cleanup background state
    deactivateSelectElement().catch((err) => {
      console.error("[useSelectElementTranslation] Cleanup error:", err);
    });
  };

  /**
   * Storage change listener for external updates (e.g., from OLD system)
   */
  const setupStorageListener = async () => {
    await browserAPI.ensureReady();
    const storageListener = (changes, areaName) => {
      if (areaName === 'local' && changes.selectElementState) {
        const newState = !!changes.selectElementState.newValue;
        const oldState = !!changes.selectElementState.oldValue;
        
        if (newState !== oldState) {
          console.log(
            "[useSelectElementTranslation] Storage selectElementState changed:",
            `${oldState} -> ${newState}`
          );
          
          // Update internal state to match storage
          isSelectModeActive.value = newState;
          state.isSelecting = newState;
          
          // Clear timeout if deactivated externally
          if (!newState) {
            clearSelectionTimeout();
            state.selectedElement = null;
            state.extractedText = "";
            state.error = null;
          }
          
          // Notify parent component
          if (onModeChanged.value) {
            onModeChanged.value(newState);
          }
        }
      }
    };
    
    // Ensure browserAPI is ready before setting up listener
    if (browserAPI && browserAPI.storage && browserAPI.storage.onChanged) {
      browserAPI.storage.onChanged.addListener(storageListener);
      
      // Return cleanup function
      return () => {
        if (browserAPI && browserAPI.storage && browserAPI.storage.onChanged) {
          browserAPI.storage.onChanged.removeListener(storageListener);
        }
      };
    } else {
      console.warn("[useSelectElementTranslation] browserAPI.storage not available for storage listener");
      // Return no-op cleanup function
      return () => {};
    }
  };

  /**
   * Load current state from storage
   */
  const loadCurrentState = async () => {
    try {
      const result = await browserAPI.safeStorageGet(["selectElementState"]);
      const storageState = !!result.selectElementState;
      
      isSelectModeActive.value = storageState;
      state.isSelecting = storageState;
      
      console.log(
        "[useSelectElementTranslation] Loaded selectElementState from storage:",
        storageState,
      );
      
      // Notify parent component of loaded state
      if (onModeChanged.value) {
        onModeChanged.value(storageState);
      }
      
      return storageState;
    } catch (error) {
      console.warn(
        "[useSelectElementTranslation] Failed to load selectElementState from storage:",
        error,
      );
      return false;
    }
  };

  /**
   * تنظیم listener برای پیام‌های background script
   * مطابق با Plan1.md Event Listeners
   */
  const setupBackgroundListener = async () => {
    const messageListener = (message, sender) => {
      // Only handle select element related messages
      const selectElementActions = [
        "elementSelected",
        "elementSelectionError",
        "elementSelectionCancelled",
        "elementSelectionSuccess",
      ];

      if (!selectElementActions.includes(message.action)) {
        // Ignore TTS and other unrelated messages
        return;
      }

      console.log(
        "[useSelectElementTranslation] Background message received:",
        message,
      );

      // مدیریت پیام انتخاب element
      if (message.action === "elementSelected") {
        handleElementSelected(message.data);
      }
      // مدیریت خطاهای element selection
      else if (message.action === "elementSelectionError") {
        handleSelectElementError(
          new Error(message.data?.error || "Element selection failed"),
        );
      }
      // مدیریت لغو selection توسط کاربر (ESC, etc.)
      else if (message.action === "elementSelectionCancelled") {
        console.log(
          "[useSelectElementTranslation] Element selection cancelled via content script:",
          message.data,
        );
        state.isSelecting = false;
        isSelectModeActive.value = false; // همگام‌سازی toggle state
        clearSelectionTimeout();

        // همگام‌سازی با storage
        browserAPI.safeStorageSet({ selectElementState: false })
          .catch((error) => {
            console.warn(
              "[useSelectElementTranslation] Failed to update storage on cancellation:",
              error,
            );
          });

        if (onModeChanged.value) {
          onModeChanged.value(false);
        }

        console.log(
          "[useSelectElementTranslation] Select mode state synced after cancellation",
        );
      }
      // مدیریت success پیام‌ها
      else if (message.action === "elementSelectionSuccess") {
        console.log(
          "[useSelectElementTranslation] Element selection completed successfully",
        );
        state.isSelecting = false;
        isSelectModeActive.value = false; // همگام‌سازی toggle state
        clearSelectionTimeout();

        // همگام‌سازی با storage
        browserAPI.safeStorageSet({ selectElementState: false })
          .catch((error) => {
            console.warn(
              "[useSelectElementTranslation] Failed to update storage on success:",
              error,
            );
          });

        if (onModeChanged.value) {
          onModeChanged.value(false);
        }
      }
    };

    // Setup message listener using browserAPI (standard pattern)
    browserAPI.onMessage.addListener(messageListener);
  };

  // Storage listener cleanup function
  let storageListenerCleanup = null;

  // Setup message listener on mount
  onMounted(async () => {
    setupBackgroundListener();
    
    // Setup storage listener for external state changes
    storageListenerCleanup = await setupStorageListener();
    
    // Load initial state from storage
    loadCurrentState().catch((error) => {
      console.warn("[useSelectElementTranslation] Failed to load initial state:", error);
    });
  });

  onUnmounted(() => {
    console.log(
      "[useSelectElementTranslation] Component unmounted, cleaning up",
    );

    // پاکسازی timeout
    clearSelectionTimeout();

    // Cleanup storage listener
    if (storageListenerCleanup) {
      storageListenerCleanup();
      storageListenerCleanup = null;
    }

    // Cleanup is handled automatically by browserAPI

    // غیرفعال‌سازی mode در صورت فعال بودن
    if (state.isSelecting) {
      deactivateSelectElement().catch((err) => {
        console.error(
          "[useSelectElementTranslation] Cleanup deactivation error:",
          err,
        );
      });
    }
  });

  // Public API
  return {
    // State (readonly for external components)
    isActivating: readonly(ref(state.isActivating)),
    isSelecting: readonly(ref(state.isSelecting)),
    selectedElement: readonly(ref(state.selectedElement)),
    extractedText: readonly(ref(state.extractedText)),
    error: readonly(ref(state.error)),
    isSelectModeActive: readonly(isSelectModeActive), // Ensure this is readonly

    // Methods
    activateSelectElement,
    deactivateSelectElement,
    toggleSelectElement,

    // Event handlers for parent components
    onTextExtracted,
    onModeChanged,

    // Utilities
    handleElementSelected,
    loadCurrentState,
    setupStorageListener,
  };
}
