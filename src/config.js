// src/config.js

export const TRANSLATION_ERRORS = {
  INVALID_CONTEXT:
    "Extension context invalid. Please refresh the page to continue.",
  API_KEY_MISSING: "API Key is missing",
  API_KEY_WRONG: "API Key is wrong",
  API_KEY_FORBIDDEN: "API Key is forbidden",
  API_URL_MISSING: "API URL is missing",
  AI_MODEL_MISSING: "AI Model is missing",
  SERVICE_OVERLOADED: "Translation service overloaded, Try later",
  NETWORK_FAILURE: "Connection to server failed",
  INVALID_RESPONSE: "Invalid API response format",
  CONTEXT_LOST: "Extension context lost",
};

// Shared configuration (initial defaults)
export const CONFIG = {
  USE_MOCK: false,
  DEBUG_MODE: false,
  SOURCE_LANGUAGE: "English",
  TARGET_LANGUAGE: "Persian",
  TRANSLATION_API: "gemini",
  API_URL:
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
  API_KEY: "",
  WEBAI_API_URL: "http://localhost:6969/translate",
  WEBAI_API_MODEL: "gemini-2.0-flash",
  OPENAI_API_KEY: "",
  OPENAI_API_URL: "https://api.openai.com/v1/chat/completions",
  OPENAI_API_MODEL: "gpt-3.5-turbo",
  OPENROUTER_API_KEY: "",
  OPENROUTER_API_URL: "https://openrouter.ai/api/v1/chat/completions",
  OPENROUTER_API_MODEL: "openai/gpt-3.5-turbo",
  HIGHLIGHT_STYLE: "2px solid red",
  PROMPT_BASE_FIELD: `You are a translation service. Your task is to translate text while strictly preserving its structure, formatting, and line breaks. Follow these rules:

- If the input is in $_{SOURCE}, translate it to $_{TARGET}.
- If the input is in $_{TARGET}, translate it to $_{SOURCE}.
- If the input is in any other language, translate it to $_{TARGET}.
- If the input has grammar mistakes but is in $_{TARGET}, translate it to $_{SOURCE} while preserving the intended meaning.

Return **only** the translated text without any extra words, explanations, markdown, or modifications.

\`\`\`text input
$_{TEXT}
\`\`\`
`,
  PROMPT_BASE_SELECT: `Act as an automated JSON translation service. The input is a JSON array where each object contains a "text" property. 

1. Translate each "text" value according to the given rules: $_{USER_RULES}
2. Preserve all input elements. **Do not omit, modify, or skip any entry.**
3. If translation is not needed for a specific item (e.g., numbers, hashtags, URLs), **return the original value unchanged.**
4. Maintain the internal structure, formatting, and line breaks exactly.
5. Output **only** the translated JSON array, with no extra text, explanations, or markdown.

\`\`\`json input
$_{TEXT}
\`\`\`
  `,
  PROMPT_TEMPLATE: `- If the input is in $_{SOURCE}, translate it to $_{TARGET}.
- If the input is in $_{TARGET}, translate it to $_{SOURCE}.
- If the input is in any other language, translate it to $_{TARGET}.
- If the input has grammar mistakes but is in $_{TARGET}, translate it to $_{SOURCE} while preserving the intended meaning.`,

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
  ICON_STATUS: "⏳ ",
  ICON_REVERT: "",
  ICON_WARNING: "⚠️ ",
  ICON_INFO: "🔵 ",
  RTL_REGEX: /[\u0600-\u06FF]/,
  PERSIAN_REGEX:
    /^(?=.*[\u0600-\u06FF])[\u0600-\u06FF\u0660-\u0669\u06F0-\u06F9\u0041-\u005A\u0061-\u007A\u0030-\u0039\s.,:;؟!()«»@#\n\t\u200C]+$/,
  NOTIFICATION_ALIGNMENT: "right", // برای جهت قرارگیری کلی اعلان
  NOTIFICATION_TEXT_DIRECTION: "rtl", // جهت پیش فرض متن (راست به چپ)
  NOTIFICATION_TEXT_ALIGNMENT: "right", // ترازبندی پیش فرض متن (راست)
};

export const TranslationMode = {
  Field: "field",
  SelectElement: "select_element",
};

// Initial state
export const state = {
  selectElementActive: false,
  highlightedElement: null,
  activeTranslateIcon: null,
  originalTexts: new Map(),
  translateMode: null,
};

let settingsCache = null;

export const getSettingsAsync = async () => {
  if (settingsCache !== null) {
    return settingsCache;
  }
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(null, (items) => {
        settingsCache = items;
        resolve(items);
      });
    } catch (error) {
      resolve({});
    }
  });
};

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && settingsCache) {
    Object.keys(changes).forEach((key) => {
      settingsCache[key] = changes[key].newValue;
    });
  }
});

export const getUseMockAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.USE_MOCK || CONFIG.USE_MOCK;
};

export const getDebugModeAsync = async () => {
  // if (process.env.NODE_ENV === "development") {
  //   return true;
  // }

  const settings = await getSettingsAsync();
  return settings.DEBUG_MODE || CONFIG.DEBUG_MODE;
};

export const IsDebug = async () => {
  if (settingsCache && settingsCache.DEBUG_MODE !== undefined) {
    return settingsCache.DEBUG_MODE;
  }
  return await getDebugModeAsync();
};

export const getApiKeyAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.API_KEY || CONFIG.API_KEY;
};

export const getApiUrlAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.API_URL || CONFIG.API_URL;
};

export const getSourceLanguageAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.SOURCE_LANGUAGE || CONFIG.SOURCE_LANGUAGE;
};

export const getTargetLanguageAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.TARGET_LANGUAGE || CONFIG.TARGET_LANGUAGE;
};

export const getPromptAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.PROMPT_TEMPLATE || CONFIG.PROMPT_TEMPLATE;
};

export const getPromptBASESelectAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.PROMPT_BASE_SELECT || CONFIG.PROMPT_BASE_SELECT;
};

export const getPromptBASEFieldAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.PROMPT_BASE_FIELD || CONFIG.PROMPT_BASE_FIELD;
};

export const getTranslationApiAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.TRANSLATION_API || CONFIG.TRANSLATION_API;
};

export const getWebAIApiUrlAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.WEBAI_API_URL || CONFIG.WEBAI_API_URL;
};

export const getWebAIApiModelAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL;
};

export const getOpenAIApiKeyAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY;
};

export const getOpenAIApiUrlAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.OPENAI_API_URL || CONFIG.OPENAI_API_URL;
};

export const getOpenAIModelAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL;
};

export const getOpenRouterApiKeyAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.OPENROUTER_API_KEY || CONFIG.OPENROUTER_API_KEY;
};

export const getOpenRouterApiModelAsync = async () => {
  const settings = await getSettingsAsync();
  return settings.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL;
};

export const getOpenRouterApiKeyAsync1 = () => {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get("openrouterApiKey", (data) => {
        if (settingsCache) {
          settingsCache.OPENROUTER_API_KEY =
            data.OPENROUTER_API_KEY || CONFIG.OPENROUTER_API_KEY;
        }
        resolve(data.OPENROUTER_API_KEY || CONFIG.OPENROUTER_API_KEY);
      });
    } catch (error) {
      resolve(CONFIG.OPENROUTER_API_KEY);
    }
  });
};

export const getOpenRouterApiModelAsync1 = () => {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get("openrouterApiModel", (data) => {
        if (settingsCache) {
          settingsCache.OPENROUTER_API_MODEL =
            data.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL;
        }
        resolve(data.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL);
      });
    } catch (error) {
      // console.warn(
      //   "[Config] Error getting OPENROUTER_API_MODEL (context invalidated?):",
      //   error
      // );
      // بازگرداندن مقدار پیش‌فرض در صورت بروز خطا
      resolve(CONFIG.OPENROUTER_API_MODEL);
    }
  });
};
