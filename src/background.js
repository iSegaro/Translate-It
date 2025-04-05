// src/background.js
import {
  CONFIG,
  getApiKeyAsync,
  getSettingsAsync,
  TRANSLATION_ERRORS,
  TranslationMode,
} from "./config.js";
import { ErrorHandler, ErrorTypes } from "./services/ErrorService.js";
import { logME } from "./utils/helpers.js";
import { getTranslateWithSelectElementAsync } from "./config.js";
import { translateText } from "./utils/api.js";

const errorHandler = new ErrorHandler();
// نگهداری وضعیت انتخاب برای هر تب به صورت مجزا
const selectElementStates = {};
let injectionInProgress = false;

// تابع wrapper برای ارسال پیام بدون ایجاد خطای uncaught
async function safeSendMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        // فقط خطای "The message port closed before a response was received." را نادیده می‌گیریم
        // احتمال داره که Context عوض شده باشه و صفحه نیاز به رفرش داشته باشه.
        if (
          err.message ===
            "The message port closed before a response was received." ||
          err.message ===
            "Could not establish connection. Receiving end does not exist."
        ) {
          // در این حالت resolve را انجام نمی‌دهیم
        } else {
          resolve({ error: err.message });
        }
      } else {
        resolve(response);
      }
    });
  });
}

// پاکسازی وضعیت تب زمانی که تب بسته می‌شود
chrome.tabs.onRemoved.addListener((tabId) => {
  delete selectElementStates[tabId];
});

chrome.runtime.onInstalled.addListener((details) => {
  logME(`AI Writing Companion ${details.reason}d`);

  if (details.reason === "install") {
    const defaultSettings = {
      USE_MOCK: CONFIG.USE_MOCK,
      DEBUG_MODE: CONFIG.DEBUG_MODE,
      SOURCE_LANGUAGE: "English",
      TARGET_LANGUAGE: "Persian",
      PROMPT_BASE_SELECT: CONFIG.PROMPT_BASE_SELECT,
      PROMPT_BASE_FIELD: CONFIG.PROMPT_BASE_FIELD,
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

    chrome.storage.local.set(defaultSettings, () => {
      logME("[Background] Default settings initialized");
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
          PROMPT_BASE_SELECT:
            settings.PROMPT_BASE_SELECT || CONFIG.PROMPT_BASE_SELECT,
          PROMPT_BASE_FIELD:
            settings.PROMPT_BASE_FIELD || CONFIG.PROMPT_BASE_FIELD,
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

        chrome.storage.local.set(updatedSettings, () => {
          logME("[Background] Update settings...");
        });
      } catch (error) {
        throw await errorHandler.handle(error, {
          type: ErrorTypes.API,
          context: "background-Update-Settings",
        });
      }
    })();

    // ارسال پیام به content script برای اطلاع‌رسانی آپدیت
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
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
  // logME("[Background] Message => ", message);

  // پردازش پیام‌های مربوط به مدیریت Content Script
  if (message && (message.action || message.type)) {
    if (
      message.action === "CONTEXT_INVALID" ||
      message.type === "EXTENSION_RELOADED"
    ) {
      logME("[Background] Reloading extension...");
      try {
        chrome.runtime.reload();
        sendResponse({ status: "done" });
        return true;
      } catch (error) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          files: ["content.bundle.js"],
        });
      }
    } else if (message.action === "getSelectedText") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0 && sender.tab && sender.tab.id === tabs[0].id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "getSelectedText" },
            (response) => {
              sendResponse(response);
            }
          );
        } else {
          sendResponse({ selectedText: "" });
        }
      });
      return true; // برای نگه داشتن کانال پیام
    }

    if (message.action === "sendSelectedTextResponse") {
      // این پیام از content script به background ارسال می‌شود.
      // background نیازی به انجام کاری با آن ندارد و پاسخ به popup مستقیماً ارسال می‌شود.
    }
  }
  // به‌روزرسانی وضعیت انتخاب المنت
  if (
    message.action === "UPDATE_SELECT_ELEMENT_STATE" &&
    sender.tab &&
    sender.tab.id
  ) {
    selectElementStates[sender.tab.id] = message.data;
  }

  // پردازش درخواست ترجمه
  if (message.action === "fetchTranslation") {
    (async () => {
      try {
        const { promptText, targetLanguage, sourceLanguage } = message.payload;
        let translation = await translateText(
          promptText,
          TranslationMode.Popup_Translate,
          sourceLanguage,
          targetLanguage
        );

        // ذخیره متن اصلی و ترجمه در Storage
        chrome.storage.local.set({
          lastTranslation: {
            sourceText: promptText,
            translatedText: translation,
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
          },
        });

        sendResponse({ data: { translatedText: translation } });
      } catch (error) {
        const handledError = errorHandler.handle(error, {
          type: ErrorTypes.API,
          context: "background-fetchTranslation",
        });
        sendResponse({ error: handledError.message });
      }
    })();
    return true; // برای نگه داشتن کانال پیام
  }

  // پردازش درخواست فعالسازی حالت انتخاب المنت از طریق popup
  if (message.action === "activateSelectElementMode") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ error: "No active tab found" });
        return;
      }

      const tabId = tabs[0].id;

      chrome.storage.local.get(["selectElementState"], (result) => {
        const currentState = result.selectElementState || false;
        const newState = message.data ?? !currentState; // اگر مقدار فرستاده شده بود، استفاده شود؛ در غیر اینصورت معکوس شود

        chrome.storage.local.set({ selectElementState: newState }, () => {
          safeSendMessage(tabId, {
            action: "TOGGLE_SELECT_ELEMENT_MODE",
            data: newState,
          }).then((response) => {
            if (response && response.error) {
              logME(
                "[Background] Retrying injection due to error:",
                response.error
              );
              if (!injectionInProgress) {
                injectionInProgress = true;
                chrome.scripting
                  .executeScript({
                    target: { tabId },
                    files: ["content.bundle.js"],
                  })
                  .then(() => {
                    return safeSendMessage(tabId, {
                      action: "TOGGLE_SELECT_ELEMENT_MODE",
                      data: newState,
                    });
                  })
                  .then((response2) => {
                    if (response2 && response2.error) {
                      logME(
                        "[Background] Failed to inject content script:",
                        response2.error
                      );
                      errorHandler.handle(
                        new Error("Content script injection failed"),
                        {
                          type: ErrorTypes.INTEGRATION,
                          context: "content-script-injection",
                          statusCode: 500,
                        }
                      );
                    }
                  })
                  .catch((scriptError) => {
                    logME("[Background] Script execution failed:", scriptError);
                    errorHandler.handle(scriptError, {
                      type: ErrorTypes.SERVICE,
                      context: "script-execution",
                      statusCode: 500,
                    });
                  })
                  .finally(() => {
                    injectionInProgress = false;
                  });
              }
            }
          });

          sendResponse({ status: "done" });
        });
      });
    });

    return true; // برای نگه داشتن کانال پیام
  }

  if (message.action === "restart_content_script") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        logME("[Background] Restarting content script...");
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
    sendResponse({ status: "done" });
    return true;
  }
});
