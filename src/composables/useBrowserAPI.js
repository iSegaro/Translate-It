import { ref, onMounted } from 'vue';
import browser from 'webextension-polyfill';
import { MessagingStandards } from '../core/MessagingStandards.js';
import storageManager from '../core/StorageManager.js';

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
        if (browser && browser.storage && browser.runtime) {
          await browser.storage.local.get(["test"]);
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

export function useBrowserAPI(context = 'vue-generic') {
  const isReady = ref(globalApiReady.value);
  const api = ref(globalbrowserAPI.value);
  const error = ref("");
  const isLoading = ref(!globalApiReady.value);

  // Get context-specific messenger
  const messenger = MessagingStandards.getMessenger(context);

  const updateState = () => {
    isReady.value = globalApiReady.value;
    api.value = globalbrowserAPI.value;
    isLoading.value = !globalApiReady.value;
  };

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

    // Messaging (full messenger interface)
    messenger,
    sendMessage: messenger.sendMessage.bind(messenger),
    tts: messenger.specialized.tts,
    capture: messenger.specialized.capture,
    selection: messenger.specialized.selection,
    translation: messenger.specialized.translation,

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
