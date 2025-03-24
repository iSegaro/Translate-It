// src/background.js
import { CONFIG, getApiKeyAsync, getSettingsAsync } from "./config.js";
import { ErrorHandler, ErrorTypes } from "./services/ErrorService.js";

const errorHandler = new ErrorHandler();
// نگهداری وضعیت انتخاب برای هر تب به صورت مجزا
const selectionStates = {};
let injectionInProgress = false;

// تابع wrapper برای ارسال پیام بدون ایجاد خطای uncaught
async function safeSendMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        // فقط خطای "The message port closed before a response was received." را نادیده می‌گیریم
        if (
          err.message ==
            "The message port closed before a response was received." ||
          err.message ==
            "Could not establish connection. Receiving end does not exist."
        ) {
          // resolve({ error: err.message });
        } else {
          resolve({ error: err.message });
        }
      } else {
        resolve(response);
      }
    });
  });
}

chrome.action.onClicked.addListener(async () => {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
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
      if (tabId) selectionStates[tabId] = false;
      return;
    }

    // تغییر وضعیت انتخاب برای تب
    selectionStates[tabId] = !selectionStates[tabId];

    let response = await safeSendMessage(tabId, {
      action: "TOGGLE_SELECTION_MODE",
      data: selectionStates[tabId],
    });

    if (response && response.error) {
      console.debug(
        "background.js: Retrying injection due to error:",
        response.error
      );

      if (!injectionInProgress) {
        injectionInProgress = true;
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content.bundle.js"],
          });
          response = await safeSendMessage(tabId, {
            action: "TOGGLE_SELECTION_MODE",
            data: selectionStates[tabId],
          });
          if (response && response.error) {
            console.error(
              "background.js: Failed to inject content script:",
              response.error
            );
            errorHandler.handle(new Error("Content script injection failed"), {
              type: ErrorTypes.INTEGRATION,
              context: "content-script-injection",
              statusCode: 500,
            });
          }
        } catch (scriptError) {
          console.error("background.js: Script execution failed:", scriptError);
          errorHandler.handle(scriptError, {
            type: ErrorTypes.SERVICE,
            context: "script-execution",
            statusCode: 500,
          });
        } finally {
          injectionInProgress = false;
        }
      }
    }
  });
});

// پاکسازی وضعیت تب زمانی که تب بسته می‌شود
chrome.tabs.onRemoved.addListener((tabId) => {
  delete selectionStates[tabId];
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`Extension ${details.reason}d`);

  if (details.reason === "install") {
    const defaultSettings = {
      USE_MOCK: CONFIG.USE_MOCK,
      DEBUG_MODE: CONFIG.DEBUG_MODE,
      SOURCE_LANGUAGE: "English",
      TARGET_LANGUAGE: "Persian",
      PROMPT_TEMPLATE: CONFIG.PROMPT_TEMPLATE,
      TRANSLATION_API: "gemini",
      API_KEY: CONFIG.API_KEY,
      API_URL: CONFIG.API_URL,
      WEBAI_API_URL: CONFIG.WEBAI_API_URL,
      WEBAI_API_MODEL: CONFIG.WEBAI_API_MODEL,
      OPENAI_API_KEY: CONFIG.OPENAI_API_KEY,
      OPENAI_API_MODEL: CONFIG.OPENAI_API_MODEL,
      OPENROUTER_API_KEY: CONFIG.OPENROUTER_API_KEY,
      OPENROUTER_API_MODEL: CONFIG.OPENROUTER_API_MODEL,
    };

    chrome.storage.sync.set(defaultSettings, () => {
      console.debug("Default settings initialized");
    });
  } else if (details.reason === "update") {
    (async () => {
      try {
        const settings = await getSettingsAsync();
        const updatedSettings = {
          USE_MOCK:
            settings.USE_MOCK !== undefined ?
              settings.USE_MOCK
            : CONFIG.USE_MOCK,
          DEBUG_MODE:
            settings.DEBUG_MODE !== undefined ?
              settings.DEBUG_MODE
            : CONFIG.DEBUG_MODE,
          SOURCE_LANGUAGE: settings.SOURCE_LANGUAGE || CONFIG.SOURCE_LANGUAGE,
          TARGET_LANGUAGE: settings.TARGET_LANGUAGE || CONFIG.TARGET_LANGUAGE,
          PROMPT_TEMPLATE: settings.PROMPT_TEMPLATE || CONFIG.PROMPT_TEMPLATE,
          TRANSLATION_API: settings.TRANSLATION_API || CONFIG.TRANSLATION_API,
          API_KEY:
            settings.API_KEY && settings.API_KEY.trim() !== "" ?
              settings.API_KEY
            : CONFIG.API_KEY,
          API_URL: settings.API_URL || CONFIG.API_URL,
          WEBAI_API_URL: settings.WEBAI_API_URL || CONFIG.WEBAI_API_URL,
          WEBAI_API_MODEL: settings.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL,
          OPENAI_API_KEY: settings.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY,
          OPENAI_API_MODEL:
            settings.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL,
          OPENROUTER_API_KEY:
            settings.OPENROUTER_API_KEY || CONFIG.OPENROUTER_API_KEY,
          OPENROUTER_API_MODEL:
            settings.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL,
        };

        chrome.storage.sync.set(updatedSettings, () => {
          console.debug("Update settings...");
        });
      } catch (error) {
        throw errorHandler.handle(error, {
          type: ErrorTypes.API,
          context: "background-Update-Settings",
        });
      }
    })();

    // ارسال پیام به content script برای اطلاع‌رسانی آپدیت
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        // if (
        //   tab.url &&
        //   [
        //     "web.whatsapp.com",
        //     "web.telegram.org",
        //     "instagram.com",
        //     "twitter.com",
        //     "medium.com",
        //     "x.com",
        //   ].some((domain) => tab.url.includes(domain))
        // ) {
        //   chrome.tabs
        //     .sendMessage(tab.id, { type: "EXTENSION_RELOADED" })
        //     .catch(() => {});
        // }
        if (tab.url && tab.id) {
          chrome.tabs
            .sendMessage(tab.id, { type: "EXTENSION_RELOADED" })
            .catch(() => {});
        }
      });
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.debug("background.js: Message => ", message);
  if (
    message.action === "UPDATE_SELECTION_STATE" &&
    sender.tab &&
    sender.tab.id
  ) {
    selectionStates[sender.tab.id] = message.data;
  }

  if (message && (message.action || message.type)) {
    if (
      message.action === "CONTEXT_INVALID" ||
      message.type === "EXTENSION_RELOADED"
    ) {
      console.debug("background.js: Reloading extension...");
      try {
        chrome.runtime.reload();
      } catch (error) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ["content.bundle.js"],
        });
      }
    }
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

  if (message.action === "restart_content_script") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        console.debug("background.js: Restarting content script...");
        try {
          chrome.runtime.reload();
        } catch (error) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["content.bundle.js"],
          });
        }
      }
    });
  }
});
