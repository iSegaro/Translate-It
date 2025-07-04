// src/popup/main.js

import { logME } from "../utils/helpers.js";
import { CONFIG, getSettingsAsync } from "../config.js";
import DOMPurify from "dompurify";

// Import Managers/Handlers
import * as languageManager from "./languageManager.js";
import * as clipboardManager from "./clipboardManager.js";
import * as ttsManager from "./ttsManager.js";
import * as translationManager from "./translationManager.js";
import * as headerActionsManager from "./headerActionsManager.js";
import * as initializationManager from "./initializationManager.js";
import * as popupInteractionManager from "./popupInteractionManager.js";
import { app_localize_popup } from "../utils/i18n.js";
import * as excludeManager from "./excludeManager.js";
import Browser from "webextension-polyfill";
import { applyTheme } from "../utils/theme.js";

document.addEventListener("DOMContentLoaded", async () => {
  logME("[Popup Main]: DOMContentLoaded event fired.");

  try {
    // --- Initialize Managers ---
    await languageManager.init();
    await clipboardManager.init();
    ttsManager.init();
    translationManager.init();
    headerActionsManager.init();
    await initializationManager.init();
    await popupInteractionManager.init();
    await excludeManager.init();

    try {
      const popupPort = Browser.runtime.connect({ name: "popup" });
      popupPort.postMessage({ action: "popupOpened" });
    } catch (err) {
      logME("[Popup Main]: Failed to connect popup port:", err.message);
    }

    logME("[Popup Main]: All modules initialized successfully.");
  } catch (error) {
    logME("[Popup Main]: Error during initialization:", error);
    const safeHtml = DOMPurify.sanitize(
      `<div style="padding: 10px; color: red;">[AIWC] Failed to initialize extension popup. Please try reloading.</div>`,
      { RETURN_TRUSTED_TYPE: true }
    );

    const parser = new DOMParser();
    const doc = parser.parseFromString(safeHtml.toString(), "text/html");

    document.body.textContent = "";
    Array.from(doc.body.childNodes).forEach((node) =>
      document.body.appendChild(node)
    );
  } finally {
    // اجرای ترجمه بعد از اتمام کامل عملیات اولیه
    app_localize_popup(CONFIG.APPLICATION_LOCALIZE);

    // TODO: This is a quick implementation — consider refactoring or adding error handling
    const settings = await getSettingsAsync();
    applyTheme(settings.THEME);
  }
});
