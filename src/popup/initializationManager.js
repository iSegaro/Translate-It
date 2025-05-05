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

      /* eslint-disable no-unsanitized/property */
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
      elements.sourceText.value = "";
      elements.translationResult.textContent = "";
      elements.sourceLanguageInput.value = AUTO_DETECT_VALUE;
    }

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

    if (targetLangValue) {
      elements.targetLanguageInput.value = targetLangValue;
    }

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
  } catch (error) {
    logME("[InitManager]: Error loading last translation:", error);
  }
}

async function loadInitialState() {
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
          `[InitManager]: Error getting selected text (Tab ${activeTabId}): ${err.message}. Loading from storage.`
        );
        await loadLastTranslationFromStorage();
      }
    } else {
      logME("[InitManager]: No active/valid tab. Loading from storage.");
      await loadLastTranslationFromStorage();
    }
  } catch (error) {
    logME("[InitManager]: Error loading initial state:", error);
  }
}

export async function init() {
  await loadInitialState();
  logME("[InitManager]: Initialized.");
}
