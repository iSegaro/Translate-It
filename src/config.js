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
  EXTENSION_ENABLED: true,
  APPLICATION_LOCALIZE: "Farsi",
  SOURCE_LANGUAGE: "English",
  TARGET_LANGUAGE: "Farsi",
  THEME: "auto",
  selectionTranslationMode: "immediate",

  // --- API Settings ---
  TRANSLATION_API: "gemini", // gemini, webai, openai, openrouter
  API_URL:
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", // Gemini specific
  API_KEY: "", // Gemini specific
  WEBAI_API_URL: "http://localhost:6969/translate",
  WEBAI_API_MODEL: "gemini-2.0-flash",
  OPENAI_API_KEY: "",
  OPENAI_API_URL: "https://api.openai.com/v1/chat/completions",
  OPENAI_API_MODEL: "gpt-3.5-turbo",
  OPENROUTER_API_KEY: "",
  OPENROUTER_API_URL: "https://openrouter.ai/api/v1/chat/completions",
  OPENROUTER_API_MODEL: "openai/gpt-3.5-turbo",

  // --- Translation Activation Settings (New) ---
  TRANSLATE_ON_TEXT_FIELDS: true, // فعال کردن ترجمه در فیلدهای متنی (کلی)
  ENABLE_SHORTCUT_FOR_TEXT_FIELDS: true, // فعال کردن شورتکات Ctrl+/ برای فیلدهای متنی
  TRANSLATE_WITH_SELECT_ELEMENT: true, // فعال کردن ترجمه با انتخاب المان (مثلاً از منوی راست‌کلیک)
  TRANSLATE_ON_TEXT_SELECTION: true, // فعال کردن ترجمه با انتخاب متن در صفحه
  REQUIRE_CTRL_FOR_TEXT_SELECTION: false, // نیاز به نگه داشتن Ctrl هنگام انتخاب متن
  ENABLE_DICTIONARY: true, // با مکانیزم تشخیص کلمه، بعنوان دیکشنری پاسخ را نمایش میدهد

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
  // PROMPT_BASE_FIELD: `You are a translation service. Your task is to translate text while strictly preserving its structure, formatting, and line breaks. Follow these rules:

  // - If the input is in $_{SOURCE}, translate it to $_{TARGET}.
  // - If the input is in $_{TARGET}, translate it to $_{SOURCE}.
  // - If the input is in any other language, translate it to $_{TARGET}.
  // - If the input has grammar mistakes but is in $_{TARGET}, translate it to $_{SOURCE} while preserving the intended meaning.

  // Return **only** the translated text without any extra words, explanations, markdown, or modifications.

  // \`\`\`text input
  // $_{TEXT}
  // \`\`\`
  // `,

  PROMPT_BASE_FIELD: `You are a professional translation service. Your task is to translate text between $_{SOURCE} and $_{TARGET}, or from other languages to $_{TARGET}, depending on the input language.

Strictly follow these rules:

- Detect the language of the input.
- If it's in $_{SOURCE}, translate to $_{TARGET}.
- If it's in $_{TARGET}, translate to $_{SOURCE}.
- If it's in any other language, translate to $_{TARGET}.
- If the input is grammatically incorrect but in $_{TARGET}, translate it to $_{SOURCE} with intended meaning preserved.

Additional translation rules:
- Preserve the original structure, formatting, and line breaks.
- Translate fluently and naturally, as if written by a native speaker.
- Prioritize clarity and readability over literal word-for-word translation.
- Do **not** add any extra explanations, markdown, or content.

Return only the translated text below:
\`\`\`text input
$_{TEXT}
\`\`\`
`,

  // PROMPT_BASE_SELECT: `Act as an automated JSON translation service. The input is a JSON array where each object contains a "text" property.

  // 1. Translate each "text" value according to the given rules: $_{USER_RULES}
  // 2. Preserve all input elements. **Do not omit, modify, or skip any entry.**
  // 3. If translation is not needed for a specific item (e.g., numbers, hashtags, URLs), **return the original value unchanged.**
  // 4. Maintain the internal structure, formatting, and line breaks exactly.
  // 5. Output **only** the translated JSON array, with no extra text, explanations, or markdown.

  // \`\`\`json input
  // $_{TEXT}
  // \`\`\`
  PROMPT_BASE_SELECT: `Act as an automated but fluent JSON translation service. The input is a JSON array where each object contains a "text" property.

Your task:
  1. Translate each "text" value according to the following user rules: $_{USER_RULES}
  2. Preserve all input elements. **Do not omit, modify, or skip any entry.**
  3. If translation is not needed for a specific item (e.g., numbers, hashtags, URLs), **return the original value unchanged.**
  4. Maintain the internal structure, formatting, and line breaks exactly.
  5. Translations must be fluent, natural, and human-like — not literal or machine-like.
  6. Prioritize readability and meaning over word-for-word equivalence.

Return **only** the translated JSON array as output, with no explanations, markdown, or extra content.

\`\`\`json input
$_{TEXT}
\`\`\`
`,
  // PROMPT_BASE_DICTIONARY: `You are a $_{TARGET} dictionary service. Your task is to provide in detailed dictionary definitions while strictly preserving the input structure and formatting. Follow these rules:

  // - Provide the translation of the input word or phrase.
  // - Include synonyms, word type (noun, verb, adjective, etc.), and a brief definition.
  // - If applicable, provide example sentences using the word or phrase in context.
  // - If the input is ambiguous, return the most common meanings.
  // - If no definition is found, return translation only.

  // Return in $_{TARGET} language, and **ONLY** the dictionary entry without any extra words, explanations, markdown, or modifications.

  // \`\`\`text input
  // $_{TEXT}
  // \`\`\`
  // `,
  PROMPT_BASE_DICTIONARY: `You are a $_{TARGET} dictionary service. Your task is to provide rich and fluent dictionary-style definitions while strictly preserving the input structure and formatting.

Follow these rules:
  - Translate the input word or phrase to $_{TARGET}.
  - Include synonyms, word type (noun, verb, adjective, etc.), and a concise, clear definition.
  - If possible, include one or two example sentences that show how the word or phrase is used in natural context.
  - If the word or phrase is ambiguous, provide the most common meanings, ordered by usage frequency.
  - If no dictionary definition is found, return only the best-matching translation.

Formatting and tone guidelines:
  - Write fluently and naturally in $_{TARGET}, as if for a human reader.
  - Prioritize clarity, readability, and usefulness over word-for-word literalness.
  - Do **not** add explanations, markdown, or meta-comments.
  - Output should contain **only** the dictionary entry — nothing more.

\`\`\`text input
$_{TEXT}
\`\`\`
`,
  // PROMPT_BASE_POPUP_TRANSLATE: `You are a translation service. Your task is to translate text while strictly preserving its structure, formatting, and line breaks. Follow these rules:

  // - If the input is in any language, translate it to $_{TARGET}.

  // Return **only** the translated text without any extra words, explanations, markdown, or modifications.

  // \`\`\`text input
  // $_{TEXT}
  // \`\`\`
  // `,
  PROMPT_BASE_POPUP_TRANSLATE: `You are a translation service. Your task is to translate text into $_{TARGET}, while strictly preserving its structure, formatting, and line breaks.

Rules:
  - Detect the input language automatically.
  - Translate the content into $_{TARGET}.
  - The translation should be fluent, natural, and idiomatic — not literal or robotic.
  - Prioritize clarity and readability without altering structure or layout.

Return **only** the translated text without any extra words, explanations, markdown, or modifications.

\`\`\`text input
$_{TEXT}
\`\`\`
`,
  //   PROMPT_TEMPLATE: `- If the input is in $_{SOURCE}, translate it to $_{TARGET}.
  // - If the input is in $_{TARGET}, translate it to $_{SOURCE}.
  // - If the input is in any other language, translate it to $_{TARGET}.
  // - If the input has grammar mistakes but is in $_{TARGET}, translate it to $_{SOURCE} while preserving the intended meaning.`,
  PROMPT_TEMPLATE: `- If the input is in $_{SOURCE}, translate it to $_{TARGET} using fluent, natural language that preserves the original intent.
- If the input is in $_{TARGET}, translate it to $_{SOURCE} with the same fluency and clarity.
- If the input is in any other language, translate it to $_{TARGET}, prioritizing readability and meaning over literal translation.
- If the input contains grammar mistakes but is in $_{TARGET}, translate it to $_{SOURCE}, correcting the intent and expressing it in a clear, natural way.`,

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
