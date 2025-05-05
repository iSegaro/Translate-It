// src/popup/initializationManager.js
import Browser from "webextension-polyfill";
import elements from "./domElements.js";
import * as uiManager from "./uiManager.js";
import { getTargetLanguageAsync } from "../config.js";
import { getLanguageDisplayValue } from "./languageManager.js"; // Use lookup
import { AUTO_DETECT_VALUE } from "../utils/tts.js";
import { logME } from "../utils/helpers.js";
import { correctTextDirection } from "../utils/textDetection.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

async function loadLastTranslationFromStorage(setDefaultTargetLang = true) {
  return new Promise(async (resolve) => {
    try {
      const result = await Browser.storage.local.get(["lastTranslation"]);
      let targetLangValue = "";
      if (result.lastTranslation) {
        logME("[InitManager]: Loading last translation from storage.");

        elements.sourceText.value = result.lastTranslation.sourceText || "";
        correctTextDirection(
          elements.sourceText,
          result.lastTranslation.sourceText
        );

        elements.translationResult.innerHTML = DOMPurify.sanitize(
          marked.parse(result.lastTranslation.translatedText || "")
        );
        correctTextDirection(
          elements.translationResult,
          result.lastTranslation.translatedText
        );

        elements.sourceLanguageInput.value =
          getLanguageDisplayValue(result.lastTranslation.sourceLanguage) ||
          AUTO_DETECT_VALUE;

        targetLangValue = getLanguageDisplayValue(
          result.lastTranslation.targetLanguage
        );
      } else {
        logME("[InitManager]: No last translation found in storage.");
        // Ensure fields are empty if nothing is loaded
        elements.sourceText.value = "";
        elements.translationResult.textContent = "";
        elements.sourceLanguageInput.value = AUTO_DETECT_VALUE; // Default source
      }

      // Set target language only if needed (either not found in storage or forced)
      if (
        (setDefaultTargetLang && !targetLangValue) ||
        targetLangValue === AUTO_DETECT_VALUE
      ) {
        try {
          const storedTargetLang = await getTargetLanguageAsync();
          targetLangValue =
            getLanguageDisplayValue(storedTargetLang) ||
            getLanguageDisplayValue("en");
        } catch (err) {
          logME("[InitManager]: Error getting default target language:", err);
          targetLangValue = getLanguageDisplayValue("en");
        }
      }
      // Set target value if determined
      if (targetLangValue) {
        elements.targetLanguageInput.value = targetLangValue;
      }

      // Update UI visibility after loading
      uiManager.toggleClearButtonVisibility(
        elements.sourceLanguageInput,
        elements.clearSourceLanguage
      );
      uiManager.toggleClearButtonVisibility(
        elements.targetLanguageInput,
        elements.clearTargetLanguage
      );
      uiManager.toggleInlineToolbarVisibility(elements.sourceText);
      uiManager.toggleInlineToolbarVisibility(elements.translationResult);
      resolve(); // Resolve the promise once loading and UI updates are done
    } catch (error) {
      logME("[InitManager]: Error loading last translation:", error);
      resolve(); // Resolve even on error to prevent blocking
    }
  });
}

async function loadInitialState() {
  return new Promise(async (resolve) => {
    try {
      const tabs = await Browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs.length > 0 && tabs[0].id != null) {
        const activeTabId = tabs[0].id;
        try {
          let response = {};
          try {
            response = await Browser.tabs.sendMessage(activeTabId, {
              action: "getSelectedText",
            });
          } catch (err) {
            logME(
              `[InitManager]: Failed to sendMessage to content script: ${err.message}`
            );
          }

          if (response?.selectedText) {
            logME("[InitManager]: Received selected text from content script.");
            elements.sourceText.value = response.selectedText;
            elements.translationResult.textContent = "";
            elements.sourceLanguageInput.value = AUTO_DETECT_VALUE;
            // Target language should already be set by languageManager.init
            // but we can ensure clear buttons are correct
            uiManager.toggleClearButtonVisibility(
              elements.sourceLanguageInput,
              elements.clearSourceLanguage
            );
            uiManager.toggleClearButtonVisibility(
              elements.targetLanguageInput,
              elements.clearTargetLanguage
            );
            uiManager.toggleInlineToolbarVisibility(elements.sourceText);
            uiManager.toggleInlineToolbarVisibility(elements.translationResult);
          } else {
            logME(
              "[InitManager]: No selected text received. Loading from storage."
            );
            await loadLastTranslationFromStorage();
          }
        } catch (err) {
          logME(
            `[InitManager]: Error getting selected text (Tab ${activeTabId}): ${
              err.message
            }. Loading from storage.`
          );
          await loadLastTranslationFromStorage();
        }
      } else {
        logME("[InitManager]: No active/valid tab. Loading from storage.");
        await loadLastTranslationFromStorage();
      }
      resolve(); // Resolve promise after handling response
    } catch (error) {
      logME("[InitManager]: Error loading initial state:", error);
      resolve(); // Resolve even on error
    }
  });
}

export async function init() {
  // Load initial state (selected text or storage)
  await loadInitialState();
  logME("[InitManager]: Initialized.");
}
