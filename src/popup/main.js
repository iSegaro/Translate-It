// src/popup/main.js

import { logME } from "../utils/helpers.js";
import { CONFIG } from "../config.js";

// Import Managers/Handlers
import * as languageManager from "./languageManager.js";
import * as clipboardManager from "./clipboardManager.js";
import * as ttsManager from "./ttsManager.js";
import * as translationManager from "./translationManager.js";
import * as headerActionsManager from "./headerActionsManager.js";
import * as initializationManager from "./initializationManager.js";
import * as popupInteractionManager from "./popupInteractionManager.js";

import { app_localize_popup } from "../utils/i18n.js";

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

    try {
      const popupPort = browser.runtime.connect({ name: "popup" });
      popupPort.postMessage({ action: "popupOpened" });
    } catch (err) {
      logME("[Popup Main]: Failed to connect popup port:", err.message);
    }

    logME("[Popup Main]: All modules initialized successfully.");
  } catch (error) {
    logME("[Popup Main]: Error during initialization:", error);
    logME("Popup initialization failed:", error);
    document.body.innerHTML = `<div style="padding: 10px; color: red;">[AIWC] Failed to initialize extension popup. Please try reloading.</div>`;
  } finally {
    // اجرای ترجمه بعد از اتمام تمام عملیات اولیه
    app_localize_popup(CONFIG.APPLICATION_LOCALIZE);
  }
});
