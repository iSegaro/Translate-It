// src/composables/useBrowserAPI.js
// Vue composable for reliable browser API access with Vue lifecycle integration

import { ref, onMounted, onUnmounted } from "vue";
import browser from "webextension-polyfill";
import { UnifiedMessenger } from "../core/UnifiedMessenger.js";

const messenger = new UnifiedMessenger("useBrowserAPI");

// Global state for API readiness
const globalApiReady = ref(false);
const globalbrowserAPI = ref(null);
const globalReadyPromise = ref(null);

// Singleton initialization
const initializebrowserAPI = () => {
  if (globalReadyPromise.value) {
    return globalReadyPromise.value;
  }

  globalReadyPromise.value = new Promise((resolve, reject) => {
    const init = async () => {
      try {
        // With webextension-polyfill, browser is available synchronously.
        if (browser && browser.storage && browser.runtime) {
          // Test storage access to ensure API is responsive
          await browser.storage.local.get(["test"]);

          globalbrowserAPI.value = browser;
          globalApiReady.value = true;
          console.log(
            "✅ [useBrowserAPI] browser API initialized and verified via webextension-polyfill",
          );
          resolve(browser);
        } else {
          throw new Error(
            "browser API from webextension-polyfill is not available or incomplete.",
          );
        }
      } catch (error) {
        console.error(
          "❌ [useBrowserAPI] browser API initialization failed:",
          error,
        );
        globalApiReady.value = false;
        reject(error);
      }
    };
    init();
  });

  return globalReadyPromise.value;
};

export function useBrowserAPI() {
  // Local state
  const isReady = ref(globalApiReady.value);
  const api = ref(globalbrowserAPI.value);
  const error = ref("");
  const isLoading = ref(!globalApiReady.value);

  // Reactive updates
  const updateState = () => {
    isReady.value = globalApiReady.value;
    api.value = globalbrowserAPI.value;
    isLoading.value = !globalApiReady.value;
  };

  // Initialize on mount
  onMounted(async () => {
    try {
      if (!globalApiReady.value) {
        await initializebrowserAPI();
      }
      updateState();
    } catch (err) {
      error.value = err.message;
      isLoading.value = false;
      console.error("[useBrowserAPI] Mount initialization failed:", err);
    }
  });

  // Ensure browser API is ready before operations
  const ensureReady = async () => {
    if (globalApiReady.value) {
      return globalbrowserAPI.value;
    }

    try {
      return await initializebrowserAPI();
    } catch (err) {
      error.value = err.message;
      throw err;
    }
  };

  // Safe storage operations
  const safeStorageGet = async (keys) => {
    try {
      const browser = await ensureReady();
      return await browser.storage.local.get(keys);
    } catch (err) {
      console.error("[useBrowserAPI] Storage get failed:", err);
      throw err;
    }
  };

  const safeStorageSet = async (data) => {
    try {
      const browser = await ensureReady();
      return await browser.storage.local.set(data);
    } catch (err) {
      console.error("[useBrowserAPI] Storage set failed:", err);
      throw err;
    }
  };

  // Safe message sending using UnifiedMessenger
  const safeSendMessage = async (message) => {
    try {
      // No need to ensureReady here, UnifiedMessenger handles its own readiness
      const response = await messenger.sendMessage(message);
      return response;
    } catch (err) {
      console.error(
        `[useBrowserAPI] Send message failed for action '${message.action}':`,
        err,
      );
      // UnifiedMessenger already handles connection errors, just re-throw
      throw err;
    }
  };

  // Storage change listener setup
  const setupStorageListener = async (callback) => {
    try {
      const browser = await ensureReady();
      if (browser.storage && browser.storage.onChanged) {
        const listener = (changes, areaName) => {
          if (areaName === "local") {
            callback(changes);
          }
        };
        browser.storage.onChanged.addListener.call(
          browser.storage.onChanged,
          listener,
        );
        return listener;
      } else {
        console.warn(
          "[useBrowserAPI] browser.storage.onChanged is not available. Settings cache might become stale.",
        );
        return null;
      }
    } catch (err) {
      console.warn("[useBrowserAPI] Storage listener setup failed:", err);
      return null;
    }
  };

  const removeStorageListener = async (listener) => {
    if (!listener) return;

    try {
      const browser = await ensureReady();
      if (browser.storage && browser.storage.onChanged) {
        browser.storage.onChanged.removeListener(listener);
      }
    } catch (err) {
      console.warn("[useBrowserAPI] Storage listener removal failed:", err);
    }
  };

  return {
    // State
    isReady,
    api,
    error,
    isLoading,

    // Methods
    ensureReady,
    safeStorageGet,
    safeStorageSet,
    safeSendMessage,
    setupStorageListener,
    removeStorageListener,

    // Event listeners
    onMessage: browser.runtime.onMessage,

    // Utilities
    updateState,
  };
}

// Export singleton initialization for direct use
export { initializebrowserAPI };
