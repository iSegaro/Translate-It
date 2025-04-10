// src/popup/translationManager.js
import Browser from "webextension-polyfill";
import elements from "./domElements.js";
import * as uiManager from "./uiManager.js";
import {
  getLanguagePromptName,
  getLanguageDisplayValue,
} from "./languageManager.js"; // Use lookup from lang manager
import { getLanguageCode, AUTO_DETECT_VALUE } from "../utils/tts.js"; // For saving storage
import { logME } from "../utils/helpers.js";
import { marked } from "marked";

function handleTranslationResponse(
  response,
  textToTranslate,
  sourceLangIdentifier,
  targetLangIdentifier
) {
  logME(
    "[Translate]: Received translation response from background:",
    response
  );

  if (Browser.runtime.lastError) {
    logME(
      "[Translate]: Browser runtime error during translation response:",
      Browser.runtime.lastError.message
    );
    elements.translationResult.textContent = `خطا: ${Browser.runtime.lastError.message}`;
  } else if (response?.data?.translatedText) {
    // elements.translationResult.textContent = response.data.translatedText;
    elements.translationResult.innerHTML = marked.parse(
      response.data.translatedText || "(ترجمه یافت نشد)"
    ); // نمایش پیام اگر متن خالی بود

    const sourceLangCode = getLanguageCode(sourceLangIdentifier);
    const targetLangCode = getLanguageCode(targetLangIdentifier);

    Browser.storage.local
      .set({
        lastTranslation: {
          sourceText: textToTranslate,
          translatedText: response.data.translatedText,
          sourceLanguage: sourceLangCode || AUTO_DETECT_VALUE,
          targetLanguage: targetLangCode,
        },
      })
      .then(() => {
        logME("[Translate]: Last translation saved to storage.");
      })
      .catch((error) => {
        console.error("[Translate]: Error saving last translation:", error);
      });

    // Optional: Update source language if 'auto' was detected and returned by background
    // This depends on your background script sending back `detectedSourceLang`
    if (
      response.data.detectedSourceLang &&
      (sourceLangCode === AUTO_DETECT_VALUE || !sourceLangCode)
    ) {
      const detectedDisplay = getLanguageDisplayValue(
        response.data.detectedSourceLang
      );
      if (detectedDisplay) {
        elements.sourceLanguageInput.value = detectedDisplay;
        uiManager.toggleClearButtonVisibility(
          elements.sourceLanguageInput,
          elements.clearSourceLanguage
        );
        logME(
          `[Translate]: Source language updated to detected: ${detectedDisplay}`
        );
      }
    }
  } else {
    elements.translationResult.textContent =
      response?.error || "ترجمه با خطا مواجه شد.";
    logME("[Translate]: Translation failed:", response?.error);
  }
  // Show result toolbar regardless of success/failure
  uiManager.toggleInlineToolbarVisibility(elements.translationResult);
}

async function triggerTranslation() {
  const textToTranslate = elements.sourceText.value.trim();
  const targetLangIdentifier = elements.targetLanguageInput.value.trim();
  const sourceLangIdentifier = elements.sourceLanguageInput.value.trim();

  if (!textToTranslate) {
    elements.sourceText.focus();
    logME("[Translate]: No text to translate.");
    return;
  }
  if (!targetLangIdentifier) {
    logME("[Translate]: Missing target language identifier.");
    elements.targetLanguageInput.focus();
    uiManager.showVisualFeedback(
      elements.targetLanguageInput.parentElement,
      "error",
      500
    );
    return;
  }

  const targetLangCodeCheck = getLanguagePromptName(targetLangIdentifier); // Use lookup
  if (!targetLangCodeCheck || targetLangCodeCheck === AUTO_DETECT_VALUE) {
    logME(
      "[Translate]: Invalid target language selected:",
      targetLangIdentifier
    );
    elements.targetLanguageInput.focus();
    uiManager.showVisualFeedback(
      elements.targetLanguageInput.parentElement,
      "error",
      500
    );
    return;
  }

  let sourceLangCheck = getLanguagePromptName(sourceLangIdentifier); // Use lookup
  if (!sourceLangCheck || sourceLangCheck === AUTO_DETECT_VALUE) {
    sourceLangCheck = null; // Send null for auto-detect to background
  }

  elements.translationResult.textContent = "در حال ترجمه...";
  uiManager.toggleInlineToolbarVisibility(elements.translationResult); // Hide toolbar while translating

  try {
    const response = await Browser.runtime.sendMessage({
      action: "fetchTranslation",
      payload: {
        promptText: textToTranslate,
        sourceLanguage: sourceLangCheck, // Send null or language code
        targetLanguage: targetLangCodeCheck, // Send validated target code/promptName
      },
    });
    handleTranslationResponse(
      response,
      textToTranslate,
      sourceLangIdentifier,
      targetLangIdentifier
    );
  } catch (error) {
    logME("[Translate]: Error sending message to background:", error);
    elements.translationResult.textContent = "خطا در ارسال درخواست.";
    uiManager.toggleInlineToolbarVisibility(elements.translationResult);
  }
}

function setupEventListeners() {
  elements.translationForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    logME("[Translate]: Translation form submitted via button.");
    triggerTranslation();
  });

  elements.sourceText?.addEventListener("keydown", (event) => {
    const isModifierPressed = event.ctrlKey || event.metaKey;
    const isEnterKey = event.key === "Enter";
    const isSlashKey = event.key === "/";

    if (isModifierPressed && (isEnterKey || isSlashKey)) {
      event.preventDefault();
      logME(
        `[Translate]: Shortcut (${event.ctrlKey ? "Ctrl" : "Cmd"}+${event.key}) triggered translation.`
      );
      triggerTranslation(); // Call the main translation logic directly
    }
  });

  // Update source toolbar visibility on input
  elements.sourceText?.addEventListener("input", () => {
    uiManager.toggleInlineToolbarVisibility(elements.sourceText);
  });
}

export function init() {
  setupEventListeners();
  logME("[Translate]: Initialized.");
}
