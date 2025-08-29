import { ref, onMounted, getCurrentInstance } from 'vue';
import browser from 'webextension-polyfill';
import { useMessaging } from '../messaging/composables/useMessaging.js';
import { storageManager } from '@/storage/core/StorageCore.js';

// Global state for API readiness
const globalApiReady = ref(false);
const globalbrowserAPI = ref(null);
let globalReadyPromise = null;

const initializebrowserAPI = () => {
  if (globalReadyPromise) {
    return globalReadyPromise;
  }

  globalReadyPromise = new Promise((resolve, reject) => {
    const init = async () => {
      try {
        if (browser && browser.runtime) {
          // Test storage via StorageManager instead of direct browser.storage
          await storageManager.get(["__browser_api_test__"]);
          globalbrowserAPI.value = browser;
          globalApiReady.value = true;
          resolve(browser);
        } else {
          throw new Error("browser API from webextension-polyfill is not available.");
        }
      } catch (error) {
        globalApiReady.value = false;
        reject(error);
      }
    };
    init();
  });

  return globalReadyPromise;
};

export function useBrowserAPI(context = 'vue-generic') { // This context is now properly defined
  const isReady = ref(globalApiReady.value);
  const api = ref(globalbrowserAPI.value);
  const error = ref("");
  const isLoading = ref(!globalApiReady.value);

  // Get messaging utilities for this context
  const messaging = useMessaging(context);

  const updateState = () => {
    isReady.value = globalApiReady.value;
    api.value = globalbrowserAPI.value;
    isLoading.value = !globalApiReady.value;
  };

  const instance = getCurrentInstance();

  if (instance) {
    // Called from within a component's setup(), so we can use lifecycle hooks.
    onMounted(async () => {
      try {
        if (!globalApiReady.value) {
          await initializebrowserAPI();
        }
        updateState();
      } catch (err) {
        error.value = err.message;
        isLoading.value = false;
      }
    });
  } else {
    // Called from outside a component setup (e.g., at the module level in another composable).
    // Initialize directly without relying on component lifecycle.
    if (!globalApiReady.value) {
      initializebrowserAPI()
        .then(() => updateState())
        .catch(err => {
          error.value = err.message;
          isLoading.value = false;
        });
    }
  }

  const setupStorageListener = (callback) => {
    const listener = (data) => {
      const changes = { [data.key]: { newValue: data.newValue, oldValue: data.oldValue } };
      callback(changes);
    };
    storageManager.on("change", listener);
    return listener;
  };

  const removeStorageListener = (listener) => {
    if (listener) {
      storageManager.off("change", listener);
    }
  };

  return {
    // State
    isReady,
    api,
    error,
    isLoading,

    // Messaging (simplified interface)
    messaging,
    sendMessage: messaging.sendMessage,
    sendMessageNoResponse: messaging.sendMessageNoResponse,

    // Storage
    safeStorageGet: storageManager.get.bind(storageManager),
    safeStorageSet: storageManager.set.bind(storageManager),
    setupStorageListener,
    removeStorageListener,

    // Browser Events
    onMessage: browser.runtime.onMessage,
  };
}

// Export singleton initialization for direct use
export { initializebrowserAPI };
