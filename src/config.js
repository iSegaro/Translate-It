// src/config.js
import { isExtensionContextValid } from "./utils/helpers.js";

// Shared configuration (initial defaults)
export const CONFIG = {
  USE_MOCK: false,
  API_URL:
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-preview-02-05:generateContent",
  PROMPT_ENGLISH:
    "Please translate the following text into English, preserving the sentence structure (like new lines) and displaying only the output:",
  PROMPT_PERSIAN:
    "متن زیر را به فارسی ترجمه کنید، ساختار جمله (مانند خطوط جدید) را حفظ کرده و فقط خروجی را نمایش دهید:",
  HIGHLIGHT_STYLE: "2px solid red",
  DEBUG_TRANSLATED_ENGLISH: "This is a mock translation to English.",
  DEBUG_TRANSLATED_PERSIAN: "این یک ترجمه آزمایشی به فارسی است.",
  DEBUG_TRANSLATED_ENGLISH_With_NewLine:
    "This is a mock \ntranslation to English with \nnew lines.",
  DEBUG_TRANSLATED_PERSIAN_With_NewLine:
    "این یک ترجمه آزمایشی \nبرای ترجمه به فارسی \nبا خطوط جدید است.",
  HIGHTLIH_NEW_ELEMETN_RED: "2px solid red",
  TRANSLATION_ICON_TITLE: "Translate Text",
  ICON_TRANSLATION: "🌐",
  ICON_ERROR: "❌ ",
  ICON_SECCESS: "✅ ",
  ICON_STATUS: "🔄 ",
  ICON_WARNING: "⚠️ ",
  ICON_INFO: "💠 ",
  RTL_REGEX: /[\u0600-\u06FF]/,
  PERSIAN_REGEX:
    /^(?=.*[\u0600-\u06FF])[\u0600-\u06FF\u0660-\u0669\u06F0-\u06F9\u0041-\u005A\u0061-\u007A\u0030-\u0039\s.,:;؟!()«»@#\n\t\u200C]+$/,
};

// Initial state
export const state = {
  selectionActive: false,
  highlightedElement: null,
  activeTranslateIcon: null,
  originalTexts: new Map(),
  translationMode: null,
};

export const getSettingsAsync = async () => {
  return new Promise((resolve, reject) => {
    try {
      if (!isExtensionContextValid()) {
        reject(new Error("Extension context invalid"));
        return;
      }

      if (!chrome?.storage?.sync) {
        reject(new Error("Error: The extension has not loaded correctly"));
        return;
      }

      chrome.storage.sync.get(
        ["apiKey", "USE_MOCK", "API_URL", "sourceLanguage", "targetLanguage"],
        (result) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(`System error: ${chrome.runtime.lastError.message}`)
            );
            return;
          }

          resolve({
            apiKey: result.apiKey || "",
            USE_MOCK:
              result.USE_MOCK !== undefined ? result.USE_MOCK : CONFIG.USE_MOCK,
            API_URL: result.API_URL || CONFIG.API_URL,
            sourceLanguage: result.sourceLanguage || "en",
            targetLanguage: result.targetLanguage || "fa",
          });
        }
      );
    } catch (error) {
      reject(new Error(`Access error: ${error.message}`));
    }
  });
};

export const getApiKeyAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.apiKey;
};

export const getUseMockAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.USE_MOCK;
};

export const getApiUrlAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.API_URL;
};

export const getSourceLanguageAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.sourceLanguage;
};

export const getTargetLanguageAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.targetLanguage;
};

export const getPromptEnglishAsync = async () => {
  return CONFIG.PROMPT_ENGLISH;
};

export const getPromptPersianAsync = async () => {
  return CONFIG.PROMPT_PERSIAN;
};
