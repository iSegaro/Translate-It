// src/listeners/onInstalled.js
import Browser from "webextension-polyfill";
import { CONFIG, getSettingsAsync } from "../config.js";
import { logME } from "../utils/helpers.js";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";

const errorHandler = new ErrorHandler();

Browser.runtime.onInstalled.addListener((details) => {
  logME(
    `AI Writing Companion ${details.reason}${
      details.reason === "Install" ? " Installed!"
      : details.reason === "Update" ? " Updated!"
      : ""
    }`
  );

  if (details.reason === "install") {
    const defaultSettings = {
      USE_MOCK: CONFIG.USE_MOCK,
      DEBUG_MODE: CONFIG.DEBUG_MODE,
      APPLICATION_LOCALIZE: CONFIG.APPLICATION_LOCALIZE,
      SOURCE_LANGUAGE: "English",
      TARGET_LANGUAGE: "Farsi",
      PROMPT_BASE_SELECT: CONFIG.PROMPT_BASE_SELECT,
      PROMPT_BASE_FIELD: CONFIG.PROMPT_BASE_FIELD,
      PROMPT_BASE_DICTIONARY: CONFIG.PROMPT_BASE_DICTIONARY,
      PROMPT_BASE_POPUP_TRANSLATE: CONFIG.PROMPT_BASE_POPUP_TRANSLATE,
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

    Browser.storage.local
      .set(defaultSettings)
      .then(() => {
        logME("[Background] Default settings initialized");
      })
      .catch((error) => {
        logME("[Background] Error initializing default settings:", error);
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
          APPLICATION_LOCALIZE:
            settings.APPLICATION_LOCALIZE || CONFIG.APPLICATION_LOCALIZE,
          SOURCE_LANGUAGE: settings.SOURCE_LANGUAGE || CONFIG.SOURCE_LANGUAGE,
          TARGET_LANGUAGE: settings.TARGET_LANGUAGE || CONFIG.TARGET_LANGUAGE,
          PROMPT_BASE_SELECT:
            settings.PROMPT_BASE_SELECT || CONFIG.PROMPT_BASE_SELECT,
          PROMPT_BASE_FIELD:
            settings.PROMPT_BASE_FIELD || CONFIG.PROMPT_BASE_FIELD,
          PROMPT_BASE_DICTIONARY:
            settings.PROMPT_BASE_DICTIONARY || CONFIG.PROMPT_BASE_DICTIONARY,
          PROMPT_BASE_POPUP_TRANSLATE:
            settings.PROMPT_BASE_POPUP_TRANSLATE ||
            CONFIG.PROMPT_BASE_POPUP_TRANSLATE,
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

        Browser.storage.local
          .set(updatedSettings)
          .then(() => {
            logME("[Background] Update settings...");
          })
          .catch((error) => {
            logME("[Background] Error updating settings:", error);
          });

        // ارسال پیام به content script برای اطلاع‌رسانی آپدیت
        Browser.tabs
          .query({})
          .then((tabs) => {
            tabs.forEach((tab) => {
              if (tab.url && tab.id) {
                try {
                  Browser.tabs
                    .sendMessage(tab.id, { type: "EXTENSION_RELOADED" })
                    .catch(() => {});
                } catch (error) {
                  logME(
                    "[Background] Error sending EXTENSION_RELOADED message:",
                    error
                  );
                }
              }
            });
          })
          .catch((error) => {
            logME("[Background] Error querying tabs:", error);
          });
      } catch (error) {
        throw await errorHandler.handle(error, {
          type: ErrorTypes.API,
          context: "background-Update-Settings",
        });
      }
    })();
  }
});
