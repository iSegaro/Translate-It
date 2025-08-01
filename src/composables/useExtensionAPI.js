import { ref, onUnmounted } from "vue";
import { MessagingStandards } from "../core/MessagingStandards.js";

export function useExtensionAPI() {
  // Enhanced messaging for Vue extension API
  const messenger = MessagingStandards.getMessenger('vue-extension-api');
  const isConnected = ref(true);
  const messageListeners = ref([]);

  // Get browser API (webextension-polyfill or native)
  const getbrowserAPI = () => {
    if (typeof browser !== "undefined") {
      return browser;
    }
    if (typeof chrome !== "undefined") {
      return chrome;
    }
    throw new Error("Extension API not available");
  };

  const sendMessage = async (action, data = {}) => {
    try {
      // Use enhanced messaging system for better reliability
      const response = await messenger.sendMessage({
        action,
        data,
        timestamp: Date.now(),
      });

      if (!response?.success) {
        throw new Error(response?.error || "Unknown error");
      }

      return response;
    } catch (error) {
      console.error("Extension API error:", error);
      isConnected.value = false;
      throw error;
    }
  };

  const sendToTab = async (tabId, action, data = {}) => {
    try {
      const api = getbrowserAPI();
      const response = await api.tabs.sendMessage(tabId, {
        action,
        data,
        timestamp: Date.now(),
      });
      return response;
    } catch (error) {
      console.error("Failed to send tab message:", error);
      throw error;
    }
  };

  const sendToContentScript = async (action, data = {}) => {
    try {
      const [tab] = await getbrowserAPI().tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) {
        throw new Error("No active tab found");
      }
      return await sendToTab(tab.id, action, data);
    } catch (error) {
      console.error("Failed to send content script message:", error);
      throw error;
    }
  };

  const onMessage = (callback) => {
    const api = getbrowserAPI();
    const listener = (message, sender, sendResponse) => {
      callback(message, sender, sendResponse);
    };

    api.runtime.onMessage.addListener.call(api.runtime.onMessage, listener);
    messageListeners.value.push(listener);

    return () => {
      api.runtime.onMessage.removeListener(listener);
      const index = messageListeners.value.indexOf(listener);
      if (index > -1) {
        messageListeners.value.splice(index, 1);
      }
    };
  };

  const getStorageData = async (keys) => {
    try {
      const api = getbrowserAPI();
      return await api.storage.local.get(keys);
    } catch (error) {
      console.error("Failed to get storage data:", error);
      throw error;
    }
  };

  const setStorageData = async (data) => {
    try {
      const api = getbrowserAPI();
      return await api.storage.local.set(data);
    } catch (error) {
      console.error("Failed to set storage data:", error);
      throw error;
    }
  };

  const getCurrentTab = async () => {
    try {
      const api = getbrowserAPI();
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      return tab;
    } catch (error) {
      console.error("Failed to get current tab:", error);
      throw error;
    }
  };

  const openOptionsPage = async () => {
    try {
      const api = getbrowserAPI();
      await api.runtime.openOptionsPage();
    } catch (error) {
      console.error("Failed to open options page:", error);
      throw error;
    }
  };

  const openSidepanel = async () => {
    try {
      const api = getbrowserAPI();
      // Chrome-specific sidepanel API
      if (api.sidePanel) {
        await api.sidePanel.open({ windowId: window.id });
      } else {
        // Fallback to opening in a new tab
        await api.tabs.create({ url: api.runtime.getURL("sidepanel.html") });
      }
    } catch (error) {
      console.error("Failed to open sidepanel:", error);
      throw error;
    }
  };

  const createNotification = async (options) => {
    try {
      const api = getbrowserAPI();
      return await api.notifications.create(options);
    } catch (error) {
      console.error("Failed to create notification:", error);
      throw error;
    }
  };

  const captureVisibleTab = async (options = {}) => {
    try {
      const api = getbrowserAPI();
      return await api.tabs.captureVisibleTab(options);
    } catch (error) {
      console.error("Failed to capture visible tab:", error);
      throw error;
    }
  };

  const executeScript = async (tabId, details) => {
    try {
      const api = getbrowserAPI();
      return await api.tabs.executeScript(tabId, details);
    } catch (error) {
      console.error("Failed to execute script:", error);
      throw error;
    }
  };

  // Provider-specific methods
  const testProviderConnection = async (provider, config) => {
    return await sendMessage("TEST_PROVIDER_CONNECTION", { provider, config });
  };

  const saveProviderConfig = async (provider, config) => {
    return await sendMessage("SAVE_PROVIDER_CONFIG", { provider, ...config });
  };

  const getProviderConfig = async (provider) => {
    return await sendMessage("GET_PROVIDER_CONFIG", { provider });
  };

  const getProviderStatus = async (provider) => {
    return await sendMessage("GET_PROVIDER_STATUS", { provider });
  };

  // Translation methods
  const translateText = async (text, options = {}) => {
    return await sendMessage("TRANSLATE_TEXT", { text, ...options });
  };

  const translateImage = async (imageData, options = {}) => {
    return await sendMessage("TRANSLATE_IMAGE", { imageData, ...options });
  };

  // Screen capture methods
  const startScreenCapture = async () => {
    return await sendMessage("START_SCREEN_CAPTURE");
  };

  const captureScreenArea = async (coordinates) => {
    return await sendMessage("CAPTURE_SCREEN_AREA", { coordinates });
  };

  // Content script integration
  const injectContentScript = async (tabId, scriptPath) => {
    try {
      const api = getbrowserAPI();
      await api.tabs.executeScript(tabId, { file: scriptPath });
    } catch (error) {
      console.error("Failed to inject content script:", error);
      throw error;
    }
  };

  const createVueMicroApp = async (componentName, props = {}) => {
    return await sendToContentScript("CREATE_VUE_MICRO_APP", {
      componentName,
      props,
    });
  };

  const destroyVueMicroApp = async (instanceId) => {
    return await sendToContentScript("DESTROY_VUE_MICRO_APP", { instanceId });
  };

  // Context menu and extension lifecycle
  const updateContextMenu = async (options) => {
    return await sendMessage("UPDATE_CONTEXT_MENU", options);
  };

  const showTranslationTooltip = async (text, position) => {
    return await sendToContentScript("SHOW_TRANSLATION_TOOLTIP", {
      text,
      position,
    });
  };

  const hideTranslationTooltip = async () => {
    return await sendToContentScript("HIDE_TRANSLATION_TOOLTIP");
  };

  // Cleanup on component unmount
  onUnmounted(() => {
    try {
      const api = getbrowserAPI();
      messageListeners.value.forEach((listener) => {
        api.runtime.onMessage.removeListener(listener);
      });
      messageListeners.value = [];
    } catch (error) {
      console.error("Failed to cleanup message listeners:", error);
    }
  });

  return {
    // State
    isConnected,

    // Core messaging methods
    sendMessage,
    sendToTab,
    sendToContentScript,
    onMessage,

    // Storage methods
    getStorageData,
    setStorageData,

    // Tab and window methods
    getCurrentTab,
    openOptionsPage,
    openSidepanel,
    captureVisibleTab,
    executeScript,
    injectContentScript,

    // Provider methods
    testProviderConnection,
    saveProviderConfig,
    getProviderConfig,
    getProviderStatus,

    // Translation methods
    translateText,
    translateImage,

    // Screen capture methods
    startScreenCapture,
    captureScreenArea,

    // Content script Vue integration
    createVueMicroApp,
    destroyVueMicroApp,
    showTranslationTooltip,
    hideTranslationTooltip,

    // Extension features
    createNotification,
    updateContextMenu,

    // Utility
    getbrowserAPI,
  };
}
