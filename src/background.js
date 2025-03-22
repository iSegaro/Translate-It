// src/background.js
import { CONFIG, getApiKeyAsync } from "./config.js";
import NotificationManager from "./managers/NotificationManager.js";
import { ErrorHandler, ErrorTypes } from "./services/ErrorService.js";

const errorHandler = new ErrorHandler();
let isReloaded = false;
// نگهداری وضعیت انتخاب برای هر تب به صورت مجزا
const selectionStates = {};

chrome.action.onClicked.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs?.[0]?.url || !tabs[0].id) {
      errorHandler.handle(new Error("Invalid tab"), {
        type: ErrorTypes.INTEGRATION,
        context: "invalid-tab",
        statusCode: "invalid-tab",
      });
      return;
    }

    const tab = tabs[0];
    const tabId = tab.id;

    if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) {
      errorHandler.handle(new Error("Invalid protocol"), {
        type: ErrorTypes.INTEGRATION,
        context: "invalid-protocol",
        statusCode: "PERMISSION_DENIED",
      });

      // اطمینان از وجود tabId قبل از استفاده
      if (tabId) selectionStates[tabId] = false;
      return;
    }

    // ادامه عملیات اصلی
    selectionStates[tabId] = !selectionStates[tabId];

    chrome.tabs
      .sendMessage(tabId, {
        action: "TOGGLE_SELECTION_MODE",
        data: selectionStates[tabId],
      })
      .catch((error) => {
        errorHandler.handle(error, {
          type: ErrorTypes.INTEGRATION,
          context: "content-injection-error",
          statusCode: "content-injection-error",
        });
      });
  });
});

// پاکسازی وضعیت تب زمانی که تب بسته می‌شود
chrome.tabs.onRemoved.addListener((tabId) => {
  delete selectionStates[tabId];
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed/updated:", details.reason);

  // مقداردهی اولیه تنظیمات فقط در نصب اولیه
  if (details.reason === "install") {
    const defaultSettings = {
      apiKey: "",
      USE_MOCK: CONFIG.USE_MOCK,
      API_URL: CONFIG.API_URL,
      sourceLanguage: "English",
      targetLanguage: "Persian",
      promptTemplate: CONFIG.promptTemplate,
      translationApi: "gemini",
      webAIApiUrl: CONFIG.WEBAI_API_URL,
      webAIApiModel: CONFIG.WEBAI_API_MODEL,
      openaiApiKey: CONFIG.OPENAI_API_KEY,
      openaiApiModel: CONFIG.OPENAI_API_MODEL,
      openrouterApiKey: CONFIG.OPENROUTER_API_KEY,
      openrouterApiModel: CONFIG.OPENROUTER_API_MODEL,
    };

    chrome.storage.sync.set(defaultSettings, () => {
      console.log("Default settings initialized");
    });
  } else if (details.reason === "update") {
    isReloaded = true;
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (
          tab.url &&
          [
            "web.whatsapp.com",
            "web.telegram.org",
            "instagram.com",
            "twitter.com",
            "medium.com",
            "x.com",
          ].some((domain) => tab.url.includes(domain))
        ) {
          chrome.tabs
            .sendMessage(tab.id, { type: "EXTENSION_RELOADED" })
            .catch(() => {});
        }
      });
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message.action === "UPDATE_SELECTION_STATE" &&
    sender.tab &&
    sender.tab.id
  ) {
    selectionStates[sender.tab.id] = message.data;
  }
  if (message.action === "CONTEXT_INVALID") {
    chrome.runtime.reload();
  } else if (message.action === "fetchTranslation") {
    (async () => {
      try {
        const { promptText } = message.payload;
        const apiKey = await getApiKeyAsync();

        const response = await fetch(`${CONFIG.API_URL}?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
          }),
          mode: "cors",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || response.statusText);
        }

        sendResponse({ data: await response.json() });
      } catch (error) {
        const handledError = errorHandler.handle(error, {
          type: ErrorTypes.API,
          context: "background-fetchTranslation",
        });
        sendResponse({ error: handledError.message });
      }
    })();
    return true;
  }
});
