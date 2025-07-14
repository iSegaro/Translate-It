// src/config.js
import Browser from "webextension-polyfill";
import { logME } from "./utils/helpers";

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
  API_RESPONSE_INVALID: "Invalid API response format",
  CONTEXT_LOST: "Extension context lost",
};

// Shared configuration (initial defaults)
export const CONFIG = {
  APP_NAME: "Translate It",
  // --- Core Settings ---
  USE_MOCK: false,
  DEBUG_MODE: false,
  APPLICATION_LOCALIZE: "English",
  SOURCE_LANGUAGE: "English",
  TARGET_LANGUAGE: "Farsi",
  THEME: "auto",
  selectionTranslationMode: "onClick", // "immediate",
  COPY_REPLACE: "copy", // "replace",
  REPLACE_SPECIAL_SITES: true,
  CHANGELOG_URL: "https://raw.githubusercontent.com/iSegaro/Translate-It/main/Changelog.md",


  // --- API Settings ---
  TRANSLATION_API: "google", // gemini, webai, openai, openrouter, deepseek, custom, google

  API_URL:
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", // Gemini specific
  API_KEY: "", // Gemini specific
  GOOGLE_TRANSLATE_URL: "https://translate.googleapis.com/translate_a/single", // Google Translate URL
  WEBAI_API_URL: "http://localhost:6969/translate",
  WEBAI_API_MODEL: "gemini-2.0-flash",
  OPENAI_API_KEY: "",
  OPENAI_API_URL: "https://api.openai.com/v1/chat/completions",
  OPENAI_API_MODEL: "gpt-3.5-turbo",
  OPENROUTER_API_KEY: "",
  OPENROUTER_API_URL: "https://openrouter.ai/api/v1/chat/completions",
  OPENROUTER_API_MODEL: "openai/gpt-4o",
  DEEPSEEK_API_KEY: "",
  DEEPSEEK_API_URL: "https://api.deepseek.com/chat/completions",
  DEEPSEEK_API_MODEL: "deepseek-chat",
  CUSTOM_API_URL: "",
  CUSTOM_API_KEY: "",
  CUSTOM_API_MODEL: "",

  // --- Translation Activation Settings ---
  EXTENSION_ENABLED: true, // فعال بودن افزونه (کلی)
  TRANSLATE_ON_TEXT_FIELDS: false, // نمایش آیکون ترجمه در فیلدهای متنی
  ENABLE_SHORTCUT_FOR_TEXT_FIELDS: true, // فعال کردن شورتکات Ctrl+/ برای فیلدهای متنی
  TRANSLATE_WITH_SELECT_ELEMENT: true, // فعال کردن ترجمه با انتخاب المان (مثلاً از منوی راست‌کلیک)
  TRANSLATE_ON_TEXT_SELECTION: true, // فعال کردن ترجمه با انتخاب متن در صفحه
  REQUIRE_CTRL_FOR_TEXT_SELECTION: false, // نیاز به نگه داشتن Ctrl هنگام انتخاب متن
  ENABLE_DICTIONARY: true, // با مکانیزم تشخیص کلمه، بعنوان دیکشنری پاسخ را نمایش میدهد
  ENABLE_TWO_WAY: true, // به طور خودکار بین دو زبان انتخاب شده ترجمه می‌کند

  // --- UI & Styling ---
  HIGHTLIH_NEW_ELEMETN_RED: "2px solid red", // Note: typo in original key 'HIGHTLIH'? Should be HIGHLIGHT?
  TRANSLATION_ICON_TITLE: "Translate Text",
  HIGHLIGHT_STYLE: "2px solid red",
  ICON_TRANSLATION: "🌐",
  ICON_SUCCESS: "✅ ",
  ICON_WARNING: "⚠️ ",
  ICON_STATUS: "⏳ ",
  ICON_ERROR: "❌ ",
  ICON_INFO: "🔵 ",
  ICON_REVERT: "↩️",
  NOTIFICATION_ALIGNMENT: "right",
  NOTIFICATION_TEXT_DIRECTION: "rtl",
  NOTIFICATION_TEXT_ALIGNMENT: "right",

  // --- Regex & Language Specific ---
  // Matches Hebrew, Arabic and Persian ranges
  RTL_REGEX: /[\u0591-\u07FF\u0600-\u06FF]/,
  PERSIAN_REGEX:
    /^(?=.*[\u0600-\u06FF])[\u0600-\u06FF\u0660-\u0669\u06F0-\u06F9\u0041-\u005A\u0061-\u007A\u0030-\u0039\s.,:;؟!()«»@#\n\t\u200C]+$/,

  // --- Prompt Templates ---

  /*--- Start PROMPT_BASE_FIELD ---*/
  PROMPT_BASE_FIELD: `You are a professional translation service. Your task is to accurately and fluently translate text between $_{SOURCE} and $_{TARGET}, or from any other language into $_{TARGET}, depending on the input.

Strictly follow these instructions:

- Detect the input language.
- If the input is in $_{SOURCE}, translate it into $_{TARGET}.
- If the input is in $_{TARGET}, translate it into $_{SOURCE}.
- If the input is in any other language, translate it into $_{TARGET}.
- If the input is grammatically incorrect but written in $_{TARGET}, translate it into $_{SOURCE}, preserving the intended meaning.

Translation quality requirements:
- Produce fluent, natural, and idiomatic translations as if written by a native speaker.
- Prioritize clarity, tone, and readability over literal or word-for-word translation.
- Maintain the original formatting, structure, and line breaks exactly.
- Do **not** include any additional explanations, comments, markdown, or extra content.

Output only the translated text:
\`\`\`
$_{TEXT}
\`\`\`
`,
/*--- End PROMPT_BASE_SELECT ---*/

/*--- Start PROMPT_BASE_SELECT ---*/
  PROMPT_BASE_SELECT: `Act as a fluent and natural JSON translation service. The input is a JSON array where each object contains a "text" property.

Your task:
  1. Translate each "text" value according to the following user rules: $_{USER_RULES}
  2. Preserve all fields. **Do not omit, modify, or skip any entries.**
  3. If translation is unnecessary (e.g., for numbers, hashtags, URLs), **return the original value unchanged.**
  4. Retain exact formatting, structure, and line breaks.
  5. Ensure translations are fluent, idiomatic, and natural — not literal or robotic.
  6. Prioritize meaning and readability over strict word-for-word translation.

Return **only** the translated JSON array. Do not include explanations, markdown, or any extra content.

\`\`\`json input
$_{TEXT}
\`\`\`
`,
/*--- End PROMPT_BASE_SELECT ---*/


/*--- Start PROMPT_BASE_DICTIONARY ---*/
  PROMPT_BASE_DICTIONARY: `You are a $_{TARGET} dictionary service. Your job is to provide rich, fluent dictionary-style definitions while fully preserving the input structure and formatting.

Follow these instructions:
  - Translate the input word or phrase into $_{TARGET}.
  - Include synonyms, part of speech (noun, verb, adjective, etc.), and a brief, clear definition.
  - If appropriate, add one or two example sentences demonstrating real-world usage.
  - If the word is ambiguous, provide the most common meanings based on usage frequency.
  - If no full definition is available, return only the best possible translation.

Stylistic guidelines:
  - Write fluently and naturally in $_{TARGET}, as if for a native reader.
  - Ensure clarity and usefulness; avoid robotic or overly literal wording.
  - Do **not** include markdown, comments, or any additional explanation.
  - Output **only** the dictionary entry — nothing more.

\`\`\`text input
$_{TEXT}
\`\`\`
`,
/*--- End PROMPT_BASE_DICTIONARY ---*/

  /*--- Start PROMPT_BASE_POPUP_TRANSLATE ---*/
  PROMPT_BASE_POPUP_TRANSLATE: `You are a translation service. Your task is to translate the input text into $_{TARGET}, while strictly preserving its structure, formatting, and line breaks.

Instructions:
  - Automatically detect the input language.
  - Translate the content into $_{TARGET}.
  - Ensure that the translation is fluent, natural, and idiomatic — not literal or mechanical.
  - Prioritize clarity, smooth flow, and accurate meaning, without changing the original structure or layout.

Return **only** the translated text. Do not include explanations, markdown, or any other content.

\`\`\`text input
$_{TEXT}
\`\`\`
`,
  /*--- End PROMPT_BASE_POPUP_TRANSLATE ---*/


  /*--- Start PROMPT_TEMPLATE ---*/
  PROMPT_TEMPLATE: `- If the input is in $_{SOURCE}, translate it into $_{TARGET} using fluent and natural language, while preserving the original intent.
- If the input is in $_{TARGET}, translate it into $_{SOURCE} with the same level of fluency and clarity.
- If the input is in any other language, translate it into $_{TARGET}, focusing on readability, tone, and meaning rather than literal translation.
- If the input contains grammatical errors but is in $_{TARGET}, translate it into $_{SOURCE}, correcting and expressing the intended meaning in a clear, natural way.`,
  /*--- End PROMPT_TEMPLATE ---*/

  // --- Debugging Values ---
  DEBUG_TRANSLATED_ENGLISH: "This is a mock translation to English.",
  DEBUG_TRANSLATED_PERSIAN: "این یک ترجمه آزمایشی به فارسی است.",
  DEBUG_TRANSLATED_ENGLISH_With_NewLine:
    "This is a mock \ntranslation to English with \nnew lines.",
  DEBUG_TRANSLATED_PERSIAN_With_NewLine:
    "این یک ترجمه آزمایشی \nبرای ترجمه به فارسی \nبا خطوط جدید است.",
};

// --- Enums & State ---
export const TranslationMode = {
  Field: "field",
  SelectElement: "select_element",
  Selection: "selection",
  Dictionary_Translation: "dictionary",
  Popup_Translate: "popup_translate",
};

export const state = {
  selectElementActive: false,
  highlightedElement: null,
  activeTranslateIcon: null,
  originalTexts: new Map(),
  translateMode: null,
};

// --- Settings Cache & Retrieval ---
let settingsCache = null;

// Fetches all settings and caches them
export const getSettingsAsync = async () => {
  // Return cache if available
  if (settingsCache !== null) {
    return settingsCache;
  }
  // Otherwise, fetch from storage
  return Browser.storage.local
    .get(null)
    .then((items) => {
      // Combine fetched items with defaults to ensure all keys exist
      settingsCache = { ...CONFIG, ...items };
      return settingsCache;
    })
    .catch((error) => {
      // Handle error (e.g., log it, return default CONFIG)
      logME("Error fetching settings:", error);
      settingsCache = { ...CONFIG }; // Use defaults on error
      return settingsCache;
    });
};

// Listener to update cache when settings change in storage
if (Browser && Browser.storage && Browser.storage.onChanged) {
  Browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && settingsCache) {
      // let updated = false;
      Object.keys(changes).forEach((key) => {
        // Check if the key exists in our CONFIG or was already in cache
        if (
          Object.prototype.hasOwnProperty.call(CONFIG, key) ||
          (settingsCache &&
            Object.prototype.hasOwnProperty.call(settingsCache, key))
        ) {
          const newValue = changes[key].newValue;
          // Update cache only if the value actually changed
          if (settingsCache[key] !== newValue) {
            settingsCache[key] = newValue;
            // updated = true;
          }
        }
      });
      // Optional: Log if cache was updated
      // if (updated) {
      //   logME("Settings cache updated by storage change listener.");
      // }
    }
  });
} else {
  logME(
    "Browser.storage.onChanged not available. Settings cache might become stale."
  );
}

// --- Individual Setting Getters (Using Cache) ---

// Helper function to get a single setting value using the cache
const getSettingValueAsync = async (key, defaultValue) => {
  const settings = await getSettingsAsync(); // Ensures cache is populated
  // Use optional chaining and nullish coalescing for safety
  return settings?.[key] ?? defaultValue;
};

export const getUseMockAsync = async () => {
  return getSettingValueAsync("USE_MOCK", CONFIG.USE_MOCK);
};

export const getDebugModeAsync = async () => {
  return getSettingValueAsync("DEBUG_MODE", CONFIG.DEBUG_MODE);
};

export const getThemeAsync = async () => {
  return getSettingValueAsync("THEME", CONFIG.THEME);
};

// Function to check debug mode potentially faster if cache is warm
export const IsDebug = async () => {
  // Check cache directly first for slight performance gain if already loaded
  if (settingsCache && settingsCache.DEBUG_MODE !== undefined) {
    return settingsCache.DEBUG_MODE;
  }
  return getDebugModeAsync();
};

export const getApiKeyAsync = async () => {
  return getSettingValueAsync("API_KEY", CONFIG.API_KEY);
};

export const getApiUrlAsync = async () => {
  return getSettingValueAsync("API_URL", CONFIG.API_URL);
};

// Google Translate Specific
export const getGoogleTranslateUrlAsync = async () => {
  return getSettingValueAsync("GOOGLE_TRANSLATE_URL", CONFIG.GOOGLE_TRANSLATE_URL);
};

export const getApplication_LocalizeAsync = async () => {
  return getSettingValueAsync(
    "APPLICATION_LOCALIZE",
    CONFIG.APPLICATION_LOCALIZE
  );
};

export const getAppNameAsync = async () => {
  return getSettingValueAsync("APP_NAME", CONFIG.APP_NAME);
};

export const getExtensionEnabledAsync = async () => {
  return getSettingValueAsync("EXTENSION_ENABLED", CONFIG.EXTENSION_ENABLED);
};

export const getSourceLanguageAsync = async () => {
  return getSettingValueAsync("SOURCE_LANGUAGE", CONFIG.SOURCE_LANGUAGE);
};

export const getTargetLanguageAsync = async () => {
  return getSettingValueAsync("TARGET_LANGUAGE", CONFIG.TARGET_LANGUAGE);
};

export const getEnableDictionaryAsync = async () => {
  return getSettingValueAsync("ENABLE_DICTIONARY", CONFIG.ENABLE_DICTIONARY);
};

export const getEnableTwoWayAsync = async () => {
  return getSettingValueAsync("ENABLE_TWO_WAY", CONFIG.ENABLE_TWO_WAY);
};

export const getPromptAsync = async () => {
  return getSettingValueAsync("PROMPT_TEMPLATE", CONFIG.PROMPT_TEMPLATE);
};

export const getPromptDictionaryAsync = async () => {
  return getSettingValueAsync(
    "PROMPT_BASE_DICTIONARY",
    CONFIG.PROMPT_BASE_DICTIONARY
  );
};

export const getPromptPopupTranslateAsync = async () => {
  return getSettingValueAsync(
    "PROMPT_BASE_POPUP_TRANSLATE",
    CONFIG.PROMPT_BASE_POPUP_TRANSLATE
  );
};

export const getPromptBASESelectAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_SELECT", CONFIG.PROMPT_BASE_SELECT);
};

export const getPromptBASEFieldAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_FIELD", CONFIG.PROMPT_BASE_FIELD);
};

export const getTranslationApiAsync = async () => {
  return getSettingValueAsync("TRANSLATION_API", CONFIG.TRANSLATION_API);
};

// WebAI Specific
export const getWebAIApiUrlAsync = async () => {
  return getSettingValueAsync("WEBAI_API_URL", CONFIG.WEBAI_API_URL);
};

export const getWebAIApiModelAsync = async () => {
  return getSettingValueAsync("WEBAI_API_MODEL", CONFIG.WEBAI_API_MODEL);
};

// DeepSeek Specific
export const getDeepSeekApiKeyAsync = async () => {
  return getSettingValueAsync("DEEPSEEK_API_KEY", CONFIG.DEEPSEEK_API_KEY);
};

export const getDeepSeekApiModelAsync = async () => {
  return getSettingValueAsync("DEEPSEEK_API_MODEL", CONFIG.DEEPSEEK_API_MODEL);
};

// Custom Provider Specific
export const getCustomApiUrlAsync = async () => {
  return getSettingValueAsync("CUSTOM_API_URL", CONFIG.CUSTOM_API_URL);
};

export const getCustomApiKeyAsync = async () => {
  return getSettingValueAsync("CUSTOM_API_KEY", CONFIG.CUSTOM_API_KEY);
};

export const getCustomApiModelAsync = async () => {
  return getSettingValueAsync("CUSTOM_API_MODEL", CONFIG.CUSTOM_API_MODEL);
};

// OpenAI Specific
export const getOpenAIApiKeyAsync = async () => {
  return getSettingValueAsync("OPENAI_API_KEY", CONFIG.OPENAI_API_KEY);
};

export const getOpenAIApiUrlAsync = async () => {
  // Note: OpenAI URL might not be configurable in your options page?
  // If it is, use getSettingValueAsync like others. If not, just return CONFIG.
  return CONFIG.OPENAI_API_URL; // Or getSettingValueAsync if user can change it
};

export const getOpenAIModelAsync = async () => {
  return getSettingValueAsync("OPENAI_API_MODEL", CONFIG.OPENAI_API_MODEL);
};

// OpenRouter Specific
export const getOpenRouterApiKeyAsync = async () => {
  return getSettingValueAsync("OPENROUTER_API_KEY", CONFIG.OPENROUTER_API_KEY);
};

export const getOpenRouterApiModelAsync = async () => {
  return getSettingValueAsync(
    "OPENROUTER_API_MODEL",
    CONFIG.OPENROUTER_API_MODEL
  );
};

// --- New Activation Settings Getters ---
export const getTranslateOnTextFieldsAsync = async () => {
  return getSettingValueAsync(
    "TRANSLATE_ON_TEXT_FIELDS",
    CONFIG.TRANSLATE_ON_TEXT_FIELDS
  );
};

export const getEnableShortcutForTextFieldsAsync = async () => {
  return getSettingValueAsync(
    "ENABLE_SHORTCUT_FOR_TEXT_FIELDS",
    CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS
  );
};

export const getTranslateWithSelectElementAsync = async () => {
  return getSettingValueAsync(
    "TRANSLATE_WITH_SELECT_ELEMENT",
    CONFIG.TRANSLATE_WITH_SELECT_ELEMENT
  );
};

export const getTranslateOnTextSelectionAsync = async () => {
  return getSettingValueAsync(
    "TRANSLATE_ON_TEXT_SELECTION",
    CONFIG.TRANSLATE_ON_TEXT_SELECTION
  );
};

export const getRequireCtrlForTextSelectionAsync = async () => {
  return getSettingValueAsync(
    "REQUIRE_CTRL_FOR_TEXT_SELECTION",
    CONFIG.REQUIRE_CTRL_FOR_TEXT_SELECTION
  );
};

export const getCOPY_REPLACEAsync = async () => {
  return getSettingValueAsync(
    "COPY_REPLACE",
    CONFIG.COPY_REPLACE
  );
};

export const getREPLACE_SPECIAL_SITESAsync = async () => {
  return getSettingValueAsync(
    "REPLACE_SPECIAL_SITES",
    CONFIG.REPLACE_SPECIAL_SITES
  );
};