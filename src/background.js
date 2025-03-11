// src/background.js
import { CONFIG, getApiKeyAsync } from "./config.js";
import NotificationManager from "./managers/NotificationManager.js"; // Import NotificationManager

// Detect extension reload
let isReloaded = false;
const notifier = new NotificationManager(); // Instantiate NotificationManager for background script
const displayedErrorsBackground = new Set(); // Set for tracking displayed errors in background

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id || tab.status !== "complete") return;

  chrome.storage.local.get(["selectionActive"], (result) => {
    const newState = !result.selectionActive;

    chrome.storage.local.set({ selectionActive: newState }, () => {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "TOGGLE_SELECTION_MODE",
          data: newState,
        })
        .catch((error) => {
          console.log("Retrying injection...");
          chrome.scripting
            .executeScript({
              target: { tabId: tab.id },
              files: ["content.bundle.js"],
            })
            .then(() => {
              chrome.tabs.sendMessage(tab.id, {
                action: "TOGGLE_SELECTION_MODE",
                data: newState,
              });
            });
        });
    });
  });
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
            "youtube.com",
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
        console.error("Translation error in background.js:", error);
        // Use processError for consistent error handling
        processErrorBackground(error, notifier);
        sendResponse({ error: "Translation failed" }); // Send generic error to content script
      }
    })();
    return true;
  }
});

/**
 * مدیریت خطاهای سیستمی و نمایش به کاربر در background script
 * @param {Error} error - شی خطا
 * @param {NotificationManager} notifier - NotificationManager instance
 */
function processErrorBackground(error, notifier) {
  let message = "خطای ناشناخته";
  let type = "error";
  let onClick;

  if (error.message.includes("API key")) {
    message =
      "کلید API نامعتبر است. برای تنظیم به صفحه extension options مراجعه کنید.";
    onClick = () => openOptionsPage();
  } else if (error.message === "EXTENSION_RELOADED") {
    message = "لطفا صفحه را رفرش کنید (Ctrl+R)";
    type = "warning";
  } else if (
    error.message.includes("model is overloaded") ||
    error.message.includes("size exceeded") ||
    error.message.includes("Quota exceeded")
  ) {
    message = "The model is overloaded. Please try again later.";
    type = "warning";
  } else if (error.message.includes("API key is missing")) {
    message = "API key is missing. Please set it in the extension options.";
    onClick = () => openOptionsPage();
    type = "error";
  } else {
    message = "خطای ارتباط با سرویس ترجمه";
    console.error("processErrorBackground Error:", error);
  }

  showBackgroundNotification(message, type, notifier, onClick);
}

/**
 * نمایش notification در background script
 * @param {string} message - پیام خطا
 * @param {string} type - نوع پیام (error, warning, info, success, status)
 * @param {NotificationManager} notifier - NotificationManager instance
 * @param {Function} onClick - تابع برای اجرا در هنگام کلیک روی notification
 */
function showBackgroundNotification(message, type, notifier, onClick) {
  if (displayedErrorsBackground.has(message)) return; // جلوگیری از نمایش خطاهای تکراری

  notifier.show(message, type, true, 5000, onClick);
  displayedErrorsBackground.add(message);
  setTimeout(() => {
    displayedErrorsBackground.delete(message);
  }, 5000);
}
