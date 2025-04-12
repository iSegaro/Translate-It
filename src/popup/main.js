// src/popup/main.js
import { logME } from "../utils/helpers.js";

// Import Managers/Handlers
import * as languageManager from "./languageManager.js";
import * as clipboardManager from "./clipboardManager.js";
import * as ttsManager from "./ttsManager.js";
import * as translationManager from "./translationManager.js";
import * as headerActionsManager from "./headerActionsManager.js";
import * as initializationManager from "./initializationManager.js";
import * as popupInteractionManager from "./popupInteractionManager.js";
// uiManager and domElements are likely used internally by other managers

document.addEventListener("DOMContentLoaded", async () => {
  logME("[Popup Main]: DOMContentLoaded event fired.");

  try {
    // --- Initialize Managers ---
    // Order can be important, especially for event listeners and initial state

    // 1. Language manager sets up lists and initial language values
    await languageManager.init();

    // 2. Clipboard manager sets up listeners and checks initial paste visibility
    await clipboardManager.init(); // Made async because updatePasteButton is async

    // 3. TTS manager sets up voice listeners
    ttsManager.init();

    // 4. Translation manager sets up form submit and shortcut listeners
    translationManager.init();

    // 5. Header actions manager sets up header button listeners
    headerActionsManager.init();

    // 6. Initialization manager loads selected text OR last translation
    await initializationManager.init(); // Needs to run after languages are set

    // 7. Popup interaction manager potentially activates select mode and sets up interaction listeners
    // This should run last as it might depend on the initial state being fully loaded and config checks
    await popupInteractionManager.init();

    // ایجاد ارتباط مستمر با پس‌زمینه
    const popupPort = browser.runtime.connect({ name: "popup" });
    // (اختیاری) می‌توانید یک پیام اولیه ارسال کنید تا اطلاع دهید Popup باز شده است:
    popupPort.postMessage({ action: "popupOpened" });

    logME("[Popup Main]: All modules initialized successfully.");
  } catch (error) {
    logME("[Popup Main]: Error during initialization:", error);
    console.error("Popup initialization failed:", error);
    // Optionally display an error message to the user in the popup body
    const body = document.body;
    if (body) {
      body.innerHTML = `<div style="padding: 10px; color: red;">Failed to initialize extension popup. Please try reloading.</div>`;
    }
  }
});
