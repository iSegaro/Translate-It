// src/config.js

export const TRANSLATION_ERRORS = {
  INVALID_CONTEXT:
    "Extension context invalid. Please refresh the page to continue.",
  MISSING_API_KEY: "API key is missing",
  SERVICE_OVERLOADED: "Translation service overloaded:",
  NETWORK_FAILURE: "Connection to server failed",
  INVALID_RESPONSE: "Invalid API response format",
  CONTEXT_LOST: "Extension context lost",
};

// Shared configuration (initial defaults)
export const CONFIG = {
  USE_MOCK: false,
  CUSTOM_API_URL: "http://localhost:6969/translate",
  CUSTOM_API_MODEL: "gemini-2.0-flash",
  API_URL:
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-preview-02-05:generateContent",
  HIGHLIGHT_STYLE: "2px solid red",
  promptTemplate:
    "Perform bidirectional translation: If the input is in ${SOURCE}, translate to ${TARGET}. If in ${TARGET}, translate to ${SOURCE}. Maintain sentence structure (including line breaks). Output ONLY print the translation:``` ${TEXT} ```",
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
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (items) => {
      resolve(items);
    });
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

export const getPromptAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.promptTemplate;
};

export const getTranslationApiAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.translationApi || "gemini";
};

export const getCustomApiUrlAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.customApiUrl || CONFIG.CUSTOM_API_URL;
};

export const getCustomApiModelAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.customApiModel || CONFIG.CUSTOM_API_MODEL;
};
