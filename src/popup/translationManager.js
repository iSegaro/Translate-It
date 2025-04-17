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
import {
  correctTextDirection,
  applyElementDirection,
} from "../utils/textDetection.js";
import { marked } from "marked";
import { TranslationMode } from "../config.js";
import { getTranslationString, parseBoolean } from "../utils/i18n.js";

function extractErrorMessage(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err.message === "string") return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return "";
  }
}

/** نمایش نتیجهٔ ترجمه یا پیام خطا در Popup */
async function handleTranslationResponse(
  response,
  textToTranslate,
  sourceLangIdentifier,
  targetLangIdentifier
) {
  /* --------------------------------------------------------- *
   *           ❶ خطاى WebExtension (channel)                   *
   * --------------------------------------------------------- */
  if (Browser.runtime.lastError) {
    const msg = Browser.runtime.lastError.message;
    elements.translationResult.textContent = msg;
    correctTextDirection(elements.translationResult, msg);
    uiManager.toggleInlineToolbarVisibility(elements.translationResult);
    return;
  }

  /* --------------------------------------------------------- *
   *           ❷ موفقيتِ ترجمه                                 *
   * --------------------------------------------------------- */
  if (response?.success && response.data?.translatedText) {
    const translated = response.data.translatedText;
    elements.translationResult.classList.remove("fade-in");
    void elements.translationResult.offsetWidth;
    elements.translationResult.innerHTML = marked.parse(translated);
    elements.translationResult.classList.add("fade-in");
    correctTextDirection(elements.translationResult, translated);

    correctTextDirection(
      elements.translationResult,
      response.data.translatedText
    );

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
    /* --------------------------------------------------------- *
     *           ❸ خطاى برگردانده شده از API                     *
     * --------------------------------------------------------- */

    const fallback =
      (await getTranslationString("popup_string_translate_error_response")) ||
      "(⚠️ خطایی در ترجمه رخ داد.)";
    const msg = extractErrorMessage(response?.error) || fallback;

    elements.translationResult.innerHTML = ""; // پاکسازی کامل
    elements.translationResult.textContent = msg;
    correctTextDirection(elements.translationResult, msg);

    logME("[Translate-Popup] API error:", msg);
  }

  // در همه حال نوار ابزار را نشان بده
  uiManager.toggleInlineToolbarVisibility(elements.translationResult);
}

async function triggerTranslation() {
  const textToTranslate = elements.sourceText.value.trim();
  const targetLangIdentifier = elements.targetLanguageInput.value.trim();
  const sourceLangIdentifier = elements.sourceLanguageInput.value.trim();

  if (!textToTranslate) {
    elements.sourceText.focus();
    logME("[Translate-Popup]: No text to translate.");
    return;
  }
  correctTextDirection(elements.sourceText, textToTranslate);
  applyElementDirection(
    elements.translationResult,
    parseBoolean(await getTranslationString("IsRTL"))
  );

  if (!targetLangIdentifier) {
    logME("[Translate-Popup]: Missing target language identifier.");
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
      "[Translate-Popup]: Invalid target language selected:",
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

  elements.translationResult.textContent =
    (await getTranslationString("popup_string_during_translate")) ||
    "translating..." ||
    "درحال ترجمه...";

  elements.translationResult.innerHTML = `
<div class="spinner-overlay">
  <div class="spinner-center">
    <div class="spinner"></div>
  </div>
</div>
`;

  uiManager.toggleInlineToolbarVisibility(elements.translationResult); // Hide toolbar while translating

  // TODO: این فقط یک تست اولیه بود که هیچ تغییر نکرده
  // TODO: نیاز به بازبینی و پیاده سازی یک روش پویاتر است
  const maxDictionaryWords = 2; // حداکثر تعداد کلمات برای حالت دیکشنری
  const maxDictionaryChars = 30; // حداکثر تعداد کاراکترها برای حالت دیکشنری
  const stopWords = [
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "in",
    "on",
    "at",
    "to",
    "of",
    "for",
    "with",
    "by",
    "from",
  ]; // *** لیست کلمات رایج (بسته به زبان)

  const words = textToTranslate.trim().split(/\s+/);
  let translateMode = TranslationMode.Popup_Translate;

  if (
    words.length <= maxDictionaryWords &&
    textToTranslate.length <= maxDictionaryChars
  ) {
    if (words.length === 1) {
      const lowerCaseWord = words[0].toLowerCase();
      if (!stopWords.includes(lowerCaseWord)) {
        translateMode = TranslationMode.Dictionary_Translation;
      }
    } else if (words.length > 1) {
      translateMode = TranslationMode.Dictionary_Translation;
    }
  }
  // *** End of TODO ***

  try {
    const response = await Browser.runtime.sendMessage({
      action: "fetchTranslation",
      payload: {
        promptText: textToTranslate,
        sourceLanguage: sourceLangCheck, // Send null or language code
        targetLanguage: targetLangCodeCheck, // Send validated target code/promptName
        translateMode: translateMode,
      },
    });

    logME("[Translate-Popup]: Response from background:", response);

    await handleTranslationResponse(
      response,
      textToTranslate,
      sourceLangIdentifier,
      targetLangIdentifier
    );
  } catch (error) {
    logME("[Translate-Popup]: Error sending message to background:", error);

    elements.translationResult.innerHTML = "";
    const fallback =
      (await getTranslationString("popup_string_translate_error_trigger")) ||
      "(⚠️ خطایی در ترجمه رخ داد.)T";
    const errMsg = extractErrorMessage(error) || fallback;
    elements.translationResult.textContent = errMsg;
    correctTextDirection(elements.translationResult, errMsg);

    uiManager.toggleInlineToolbarVisibility(elements.translationResult);
  }
}

function setupEventListeners() {
  elements.translationForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    logME("[Translate-Popup]: Translation form submitted via button.");
    triggerTranslation();
  });

  elements.sourceText?.addEventListener("keydown", (event) => {
    const isModifierPressed = event.ctrlKey || event.metaKey;
    const isEnterKey = event.key === "Enter";
    const isSlashKey = event.key === "/";

    if (isModifierPressed && (isEnterKey || isSlashKey)) {
      event.preventDefault();
      logME(
        `[Translate-Popup]: Shortcut (${event.ctrlKey ? "Ctrl" : "Cmd"}+${event.key}) triggered translation.`
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
  logME("[Translate-Popup]: Initialized.");
}
