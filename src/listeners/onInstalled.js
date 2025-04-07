// src/listeners/onInstalled.js
import { CONFIG, getSettingsAsync } from "../config.js";
import { logME } from "../utils/helpers.js";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";

const errorHandler = new ErrorHandler();

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
