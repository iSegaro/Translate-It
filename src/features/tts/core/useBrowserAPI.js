import { ref, onMounted } from 'vue';
import browser from 'webextension-polyfill';
// import { useMessaging } from '@/shared/messaging/composables/useMessaging.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';

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

export function useBrowserAPI() {
  const isReady = ref(globalApiReady.value);
  const browserAPI = ref(globalbrowserAPI.value);

  onMounted(() => {
    if (!isReady.value) {
      initializebrowserAPI().then((api) => {
        browserAPI.value = api;
        isReady.value = true;
      });
    }
  });

  return {
    isReady,
    browserAPI,
  };
}

export { initializebrowserAPI };
