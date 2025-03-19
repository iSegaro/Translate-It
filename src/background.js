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
    if (tabs && tabs.length > 0) {
      const tabId = tabs[0].id;

      // تغییر وضعیت فقط برای تب فعال
      selectionStates[tabId] = !selectionStates[tabId];

      // ارسال پیام فقط به تب فعال
      chrome.tabs
        .sendMessage(tabId, {
          action: "TOGGLE_SELECTION_MODE",
          data: selectionStates[tabId],
        })
        .catch((error) => {
          console.log("Retrying injection...");
          chrome.scripting
            .executeScript({
              target: { tabId },
              files: ["content.bundle.js"],
            })
            .then(() => {
              chrome.tabs.sendMessage(tabId, {
                action: "TOGGLE_SELECTION_MODE",
                data: selectionStates[tabId],
              });
            });
        });
    }
  });
});

// پاکسازی وضعیت تب زمانی که تب بسته می‌شود
chrome.tabs.onRemoved.addListener((tabId) => {
  delete selectionStates[tabId];
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed/updated:", details.reason);

  chrome.storage.sync.get(["apiKey"], (result) => {
    console.log("Stored API Key:", result.apiKey ? "Exists" : "Missing");
  });

  if (details.reason === "update") {
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
