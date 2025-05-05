// src/listeners/onInstalled.js
import Browser from "webextension-polyfill";
import { CONFIG, getSettingsAsync } from "../config.js";
import { logME } from "../utils/helpers.js";
import { ErrorHandler } from "../services/ErrorService.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { dismissAllSelectionWindows } from "../utils/cleanupSelectionWindows.js";
import { teardownEventListeners } from "../core/EventRouter.js";

const errorHandler = new ErrorHandler();

Browser.runtime.onInstalled.addListener((details) => {
  logME(
    `[AI Writing Companion] 🌟 Successfully ${
      details.reason === "install" ? "Installed!"
      : details.reason === "update" ? "Updated!"
      : ""
    }`
  );

  teardownEventListeners();

  const initOrUpdate = async () => {
    try {
      const settings = await getSettingsAsync();

      const defaultSettings = {
        ...CONFIG,
        ...settings,
      };

      await Browser.storage.local.set(defaultSettings);
      // logME("[Background] Settings initialized");

      const tabs = await Browser.tabs.query({ url: "<all_urls>" });

      for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;

        try {
          await Browser.runtime.sendMessage({
            action: "TRY_INJECT_IF_NEEDED",
            tabId: tab.id,
            url: tab.url,
          });
        } catch {
          // logME("[onInstalled] sendMessage failed:", tab.url, err.message);
        }
      }
    } catch (error) {
      throw await errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "background-onInstalled-initOrUpdate",
      });
    }
  };

  if (details.reason === "install" || details.reason === "update") {
    initOrUpdate().then(() => {
      dismissAllSelectionWindows();
    });
  }
});
