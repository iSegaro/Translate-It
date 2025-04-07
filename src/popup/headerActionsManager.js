// src/popup/headerActionsManager.js
import elements from "./domElements.js";
import { Active_SelectElement } from "../utils/select_element.js";
import { AUTO_DETECT_VALUE } from "../utils/tts.js";
import { getTargetLanguageAsync } from "../config.js";
import { getLanguageDisplayValue } from "./languageManager.js";
import * as uiManager from "./uiManager.js";
import * as clipboardManager from "./clipboardManager.js"; // To update paste button
import { logME } from "../utils/helpers.js";

// Keep flags related to header actions local if possible
let selectElementIconClicked = false;

function setupEventListeners() {
  elements.clearStorageBtn?.addEventListener("click", () => {
    chrome.storage.local.remove("lastTranslation", async () => {
      elements.sourceText.value = "";
      elements.translationResult.textContent = "";
      uiManager.toggleInlineToolbarVisibility(elements.sourceText);
      uiManager.toggleInlineToolbarVisibility(elements.translationResult);

      // Reset languages
      elements.sourceLanguageInput.value = AUTO_DETECT_VALUE;
      try {
        const lang = await getTargetLanguageAsync();
        elements.targetLanguageInput.value =
          getLanguageDisplayValue(lang) || getLanguageDisplayValue("en");
      } catch {
        elements.targetLanguageInput.value = getLanguageDisplayValue("en");
      } finally {
        uiManager.toggleClearButtonVisibility(
          elements.targetLanguageInput,
          elements.clearTargetLanguage
        );
      }
      uiManager.toggleClearButtonVisibility(
        elements.sourceLanguageInput,
        elements.clearSourceLanguage
      );

      elements.sourceText.focus();
      logME("[HeaderActions]: Translation history and fields cleared.");
      clipboardManager.updatePasteButtonVisibility(); // Re-check clipboard
    });
  });

  elements.translatePageIcon?.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { action: "translateEntirePage" },
      (response) => {
        if (chrome.runtime.lastError) {
          logME(
            "[HeaderActions]: Error sending translate page message:",
            chrome.runtime.lastError.message
          );
        } else {
          logME("[HeaderActions]: Translate page message sent.", response);
        }
      }
    );
    window.close(); // Close popup after sending message
  });

  elements.selectElementIcon?.addEventListener("click", () => {
    selectElementIconClicked = true; // Set flag for interaction manager
    logME("[HeaderActions]: Select element icon clicked.");
    Active_SelectElement(true, true); // Activate selection mode and close popup
    // Active_SelectElement should handle closing the window implicitly
  });
}

export function init() {
  setupEventListeners();
  logME("[HeaderActions]: Initialized.");
}

// Export flag if popupInteractionManager needs to read it directly (though events might be better)
// This approach is simpler for now:
export function wasSelectElementIconClicked() {
  const wasClicked = selectElementIconClicked;
  // Optionally reset flag after checking if needed by the logic
  // selectElementIconClicked = false;
  return wasClicked;
}
