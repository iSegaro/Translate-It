// src/config.js
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { storageManager } from '../storage/core/StorageCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
// NOTE: Avoid importing LOG_COMPONENTS here to reduce risk of circular/TDZ during very early store initialization.
// Using literal 'Core' keeps semantics intact.
const logger = getScopedLogger(LOG_COMPONENTS.CONFIG, 'config');
logger.info('Config module initialized');

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
  SOURCE_LANGUAGE: "auto",
  TARGET_LANGUAGE: "en",
  THEME: "auto",
  TIMEOUT: 30000,
  selectionTranslationMode: "onClick", // "immediate",
  COPY_REPLACE: "copy", // "replace",
  REPLACE_SPECIAL_SITES: true,
  CHANGELOG_URL: "https://raw.githubusercontent.com/iSegaro/Translate-It/main/Changelog.md",


  // --- API Settings ---
  TRANSLATION_API: "google", // gemini, webai, openai, openrouter, deepseek, custom, google, browserapi

  API_URL:
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", // Gemini specific
  API_KEY: "", // Gemini specific
  GEMINI_MODEL: "gemini-2.5-flash", // Selected Gemini model
  GEMINI_THINKING_ENABLED: true, // Enable/disable thinking for supported models
  GEMINI_MODELS: [
    { value: "gemini-2.5-pro", name: "Gemini 2.5 Pro", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", thinking: { supported: true, controllable: false, defaultEnabled: true } },
    { value: "gemini-2.5-flash", name: "Gemini 2.5 Flash", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", thinking: { supported: true, controllable: true, defaultEnabled: true } },
    { value: "gemini-2.5-flash-lite-preview", name: "Gemini 2.5 Flash-Lite Preview", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent", thinking: { supported: true, controllable: true, defaultEnabled: false } },
    { value: "gemini-2.0-flash", name: "Gemini 2.0 Flash", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", thinking: { supported: false, controllable: false, defaultEnabled: false } },
    { value: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash-Lite", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent", thinking: { supported: false, controllable: false, defaultEnabled: false } }
  ],
  GOOGLE_TRANSLATE_URL: "https://translate.googleapis.com/translate_a/single", // Google Translate URL
  WEBAI_API_URL: "http://localhost:6969/translate",
  WEBAI_API_MODEL: "gemini-2.0-flash",
  OPENAI_API_KEY: "",
  OPENAI_API_URL: "https://api.openai.com/v1/chat/completions",
  OPENAI_API_MODEL: "gpt-4o",
  OPENAI_MODELS: [
    { value: "gpt-4.1", name: "GPT-4.1" },
    { value: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
    { value: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
    { value: "gpt-4o", name: "GPT-4o" },
    { value: "gpt-4o-mini", name: "GPT-4o Mini" },
    { value: "gpt-4.5-preview", name: "GPT-4.5 Preview" },
    { value: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    { value: "custom", name: "Custom Model" }
  ],
  OPENROUTER_API_KEY: "",
  OPENROUTER_API_URL: "https://openrouter.ai/api/v1/chat/completions",
  OPENROUTER_API_MODEL: "openai/gpt-4o",
  OPENROUTER_MODELS: [
    { value: "openai/gpt-4o", name: "OpenAI GPT-4o" },
    { value: "openai/gpt-4o-mini", name: "OpenAI GPT-4o Mini" },
    { value: "openai/gpt-4.1", name: "OpenAI GPT-4.1" },
    { value: "openai/gpt-4.1-mini", name: "OpenAI GPT-4.1 Mini" },
    { value: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
    { value: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku" },
    { value: "google/gemini-2.5-pro", name: "Google Gemini 2.5 Pro" },
    { value: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash" },
    { value: "meta-llama/llama-3.3-70b-instruct", name: "Meta Llama 3.3 70B" },
    { value: "mistralai/mistral-large", name: "Mistral Large" },
    { value: "custom", name: "Custom Model" }
  ],
  DEEPSEEK_API_KEY: "",
  DEEPSEEK_API_URL: "https://api.deepseek.com/chat/completions",
  DEEPSEEK_API_MODEL: "deepseek-chat",
  DEEPSEEK_MODELS: [
    { value: "deepseek-chat", name: "DeepSeek Chat (V3)" },
    { value: "deepseek-reasoner", name: "DeepSeek Reasoner (R1)" },
    { value: "custom", name: "Custom Model" }
  ],
  CUSTOM_API_URL: "",
  CUSTOM_API_KEY: "",
  CUSTOM_API_MODEL: "",

  // --- browser Translation API Settings (Chrome 138+) ---
  BROWSER_TRANSLATE_ENABLED: true, // Enable/disable browser Translation API
  BROWSER_TRANSLATE_AUTO_DOWNLOAD: true, // Automatically download language packs when needed

  // --- Translation Activation Settings ---
  EXTENSION_ENABLED: true, // فعال بودن افزونه (کلی)
  TRANSLATE_ON_TEXT_FIELDS: true, // نمایش آیکون ترجمه در فیلدهای متنی
  ENABLE_SHORTCUT_FOR_TEXT_FIELDS: true, // فعال کردن شورتکات Ctrl+/ برای فیلدهای متنی
  TRANSLATE_WITH_SELECT_ELEMENT: true, // فعال کردن ترجمه با انتخاب المان (مثلاً از منوی راست‌کلیک)
  TRANSLATE_ON_TEXT_SELECTION: true, // فعال کردن ترجمه با انتخاب متن در صفحه
  REQUIRE_CTRL_FOR_TEXT_SELECTION: false, // نیاز به نگه داشتن Ctrl هنگام انتخاب متن
  ENHANCED_TRIPLE_CLICK_DRAG: false, // فعال کردن پشتیبانی پیشرفته از triple-click + drag
  ENABLE_DICTIONARY: true, // با مکانیزم تشخیص کلمه، بعنوان دیکشنری پاسخ را نمایش میدهد
  ENABLE_SCREEN_CAPTURE: true, // فعال کردن قابلیت Screen Capture Translator
  ACTIVE_SELECTION_ICON_ON_TEXTFIELDS: true, // فعال کردن دوبار کلیک روی متن در فیلدهای متنی
  EXCLUDED_SITES: [], // وب‌سایت‌هایی که افزونه در آن‌ها غیرفعال باشد

  // --- Proxy Settings ---
  PROXY_ENABLED: false, // فعال بودن proxy
  PROXY_TYPE: "http", // نوع proxy: http, https, socks
  PROXY_HOST: "", // آدرس proxy server
  PROXY_PORT: 8080, // پورت proxy server
  PROXY_USERNAME: "", // نام کاربری proxy (اختیاری)
  PROXY_PASSWORD: "", // رمز عبور proxy (اختیاری)

  // --- UI & Styling ---
  HIGHLIGHT_NEW_ELEMENT_RED: "2px solid red", // Note: typo in original key 'HIGHTLIH'? Should be HIGHLIGHT?
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

  // --- Font Settings ---
  TRANSLATION_FONT_FAMILY: "auto", // Auto-detect based on target language or custom font
  TRANSLATION_FONT_SIZE: "14", // Font size in pixels
  FONT_SIZE_OPTIONS: [
    { value: "12", name: "Small (12px)" },
    { value: "14", name: "Default (14px)" },
    { value: "16", name: "Medium (16px)" },
    { value: "18", name: "Large (18px)" },
    { value: "20", name: "Extra Large (20px)" },
    { value: "22", name: "XXL (22px)" }
  ],

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

$_{TEXT}
`,
/*--- End PROMPT_BASE_FIELD ---*/

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

$_{TEXT}
`,
/*--- End PROMPT_BASE_SELECT ---*/


/*--- Start PROMPT_BASE_BATCH ---*/
  PROMPT_BASE_BATCH: `You are an expert translation service. Your task is to translate a batch of texts from auto-detect language to $_{TARGET}.

You will receive a series of texts separated by a unique delimiter:
"

---

"

Your response must adhere to these strict rules:
1.  Translate each text segment individually.
2.  Preserve the exact number of segments and their order.
3.  Use the same delimiter "

---

" to separate the translated texts in your output.
4.  Do NOT add any extra explanations, comments, or markdown.
5.  Maintain the original tone and formatting for each segment.
6.  If translation is unnecessary (e.g., for numbers, hashtags, URLs), **return the original value unchanged.**
7.  Ensure translations are fluent, idiomatic, and natural — not literal or robotic.

Example Input:
Hello


---


Goodbye

Example Output (for Farsi):
سلام


---


خداحافظ

Now, please translate the following texts:
$_{TEXT}
`,
/*--- End PROMPT_BASE_BATCH ---*/


/*--- Start PROMPT_BASE_DICTIONARY ---*/
  PROMPT_BASE_DICTIONARY: `You are a concise dictionary service. Translate the word/phrase into $_{TARGET} and provide only essential information.

Format your response as:
- Main translation
- Part of speech (if relevant): noun, verb, adjective, etc.
- 2-3 most common synonyms or alternative meanings (if any)

Keep it brief and useful. Do not include examples, long definitions, or explanations.

Now, please translate the following texts:
$_{TEXT}
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

Now, please translate the following texts:
$_{TEXT}
`,
  /*--- End PROMPT_BASE_POPUP_TRANSLATE ---*/

  /*--- Start PROMPT_BASE_SCREEN_CAPTURE ---*/
  PROMPT_BASE_SCREEN_CAPTURE: `You are a professional image text extraction and translation service. Your task is to extract all readable text from the provided image and translate it into $_{TARGET}.

**Your responsibilities:**
1. **Extract ALL visible text** from the image, including:
   - Main text content, titles, headers, and paragraphs
   - UI elements, buttons, labels, and menu items
   - Captions, annotations, and overlaid text
   - Signs, logos, and watermarks with readable text
   - Any other textual information visible in the image

2. **Translation Guidelines:**
   - Automatically detect the language of extracted text
   - Translate all extracted text into $_{TARGET}
   - Maintain **natural, fluent, and idiomatic** translations
   - Preserve the **original meaning and context**
   - Use **appropriate terminology** for the content type (technical, casual, formal, etc.)
   - Keep **spatial relationships** when multiple text elements exist

3. **Output Format:**
   - If the image contains **single text block**: Output only the translated text
   - If the image contains **multiple separate text elements**: Use clear formatting to distinguish between different text areas
   - **DO NOT** include explanations, descriptions, or metadata about the image
   - **DO NOT** describe non-text visual elements (colors, layout, graphics, etc.)

4. **Quality Requirements:**
   - Ensure **accuracy** in text extraction - don't miss any readable text
   - Provide **high-quality translations** that sound natural in $_{TARGET}
   - Maintain **consistency** in terminology throughout the translation
   - Handle **special characters, numbers, and symbols** appropriately

**Important:** Output ONLY the translated text content. Do not include any analysis, descriptions, or additional commentary.`,
  /*--- End PROMPT_BASE_SCREEN_CAPTURE ---*/

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
  Select_Element: "select_element",
  Selection: "selection",
  Dictionary_Translation: "dictionary",
  Popup_Translate: "popup_translate",
  Sidepanel_Translate: "sidepanel_translate",
  ScreenCapture: "screen_capture",
};

export const state = {
  selectElementActive: false,
  highlightedElement: null,
  activeTranslateIcon: null,
  originalTexts: new Map(),
  translateMode: null,
  preventTextFieldIconCreation: false, // FIX FOR DISCORD: Prevent text field icon creation during selection window transition
};

// --- Settings Cache & Retrieval via StorageManager ---
// Note: StorageManager handles caching internally, no need for manual cache

// Fetches all settings using StorageManager
export const getSettingsAsync = async () => {
  try {
    // Get all settings with CONFIG defaults through StorageManager
    const items = await storageManager.get(null);
    // Combine fetched items with defaults to ensure all keys exist
    return { ...CONFIG, ...items };
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    handler.handle(error, { type: ErrorTypes.SERVICE, context: 'config-getSettingsAsync' });
    return { ...CONFIG }; // Use defaults on error
  }
};

export const initializeSettingsListener = async () => {
  // initializeSettingsListener called - logged at TRACE level for detailed debugging
  // logger.debug('[config.js] initializeSettingsListener called - using StorageManager events');
  
  try {
    // Check if storageManager is available and initialized
    if (!storageManager || typeof storageManager.on !== 'function') {
      // StorageManager not available - logged at TRACE level for detailed debugging
      // logger.warn('[config.js] StorageManager not available or not initialized yet');
      return null;
    }

    // Setup listener through StorageManager event system
    // Note: StorageManager automatically handles caching, no manual cache management needed
    const listener = (data) => {
      // Storage change detected - logged at TRACE level for detailed debugging
      // logger.debug(`[config.js] Storage change detected via StorageManager: ${data.key} = ${data.newValue}`);
      // StorageManager handles cache updates automatically
      // Any additional processing can be added here if needed
    };

    storageManager.on('change', listener);
    logger.info('[config.js] Storage listener set up successfully');
    
    return listener; // Return listener for cleanup if needed
  } catch (error) {
    logger.error('[config.js] Failed to setup storage listener:', error);
    return null;
  }
};

// --- Individual Setting Getters (Using Cache) ---

// Helper function to get a single setting value using StorageManager
const getSettingValueAsync = async (key, defaultValue) => {
  try {
    // Let StorageManager handle caching internally
    const result = await storageManager.get({ [key]: defaultValue });
    // Value retrieved - logged at TRACE level for detailed debugging
    // logger.debug(`[config] Retrieved value for ${key}:`, result[key] ? 'present' : 'not present');
    return result[key];
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    handler.handle(error, { type: ErrorTypes.SERVICE, context: `config-getSettingValueAsync-${key}` });
    return defaultValue;
  }
};

export const getUseMockAsync = async () => {
  return getSettingValueAsync("USE_MOCK", CONFIG.USE_MOCK);
};

export const getDebugModeAsync = async () => {
  const debugMode = await getSettingValueAsync("DEBUG_MODE", CONFIG.DEBUG_MODE);
  // Update ErrorHandler with current debug mode
  try {
    const errorHandler = ErrorHandler.getInstance();
    errorHandler.setDebugMode(debugMode);
  } catch {
    // Ignore errors during ErrorHandler setup
  }
  return debugMode;
};

export const getThemeAsync = async () => {
  return getSettingValueAsync("THEME", CONFIG.THEME);
};

export const getTimeoutAsync = async () => {
  return getSettingValueAsync("TIMEOUT", CONFIG.TIMEOUT);
};

// Function to check debug mode potentially faster if cache is warm
export const IsDebug = async () => {
  // Check StorageManager cache first for performance
  if (storageManager.hasCached('DEBUG_MODE')) {
    return storageManager.getCached('DEBUG_MODE', CONFIG.DEBUG_MODE);
  }
  return getDebugModeAsync();
};

export const getApiKeyAsync = async () => {
  return getSettingValueAsync("API_KEY", CONFIG.API_KEY);
};

export const getApiUrlAsync = async () => {
  return getSettingValueAsync("API_URL", CONFIG.API_URL);
};

export const getGeminiModelAsync = async () => {
  return getSettingValueAsync("GEMINI_MODEL", CONFIG.GEMINI_MODEL);
};
export const getGeminiThinkingEnabledAsync = async () => {
  return getSettingValueAsync("GEMINI_THINKING_ENABLED", CONFIG.GEMINI_THINKING_ENABLED);
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

export const getPromptBASEBatchAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_BATCH", CONFIG.PROMPT_BASE_BATCH);
};

export const getPromptBASEFieldAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_FIELD", CONFIG.PROMPT_BASE_FIELD);
};

export const getPromptBASEScreenCaptureAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_SCREEN_CAPTURE", CONFIG.PROMPT_BASE_SCREEN_CAPTURE);
};

export const getTranslationApiAsync = async () => {
  const result = await getSettingValueAsync("TRANSLATION_API", CONFIG.TRANSLATION_API);
  // Translation API retrieved - logged at TRACE level for detailed debugging
  // logger.debug(`[config.js] getTranslationApiAsync - Returning: ${result}`);
  return result;
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

export const getEnhancedTripleClickDragAsync = async () => {
  return getSettingValueAsync(
    "ENHANCED_TRIPLE_CLICK_DRAG",
    CONFIG.ENHANCED_TRIPLE_CLICK_DRAG
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

// --- browser Translation API Getters ---
export const getbrowserTranslateEnabledAsync = async () => {
  return getSettingValueAsync(
    "BROWSER_TRANSLATE_ENABLED", 
    CONFIG.BROWSER_TRANSLATE_ENABLED
  );
};

export const getbrowserTranslateAutoDownloadAsync = async () => {
  return getSettingValueAsync(
    "BROWSER_TRANSLATE_AUTO_DOWNLOAD", 
    CONFIG.BROWSER_TRANSLATE_AUTO_DOWNLOAD
  );
};

// --- Model Selection Getters for API Providers ---
export const getOpenAIModelSelectionAsync = async () => {
  return getSettingValueAsync("OPENAI_API_MODEL", CONFIG.OPENAI_API_MODEL);
};

export const getDeepSeekModelSelectionAsync = async () => {
  return getSettingValueAsync("DEEPSEEK_API_MODEL", CONFIG.DEEPSEEK_API_MODEL);
};

export const getOpenRouterModelSelectionAsync = async () => {
  return getSettingValueAsync("OPENROUTER_API_MODEL", CONFIG.OPENROUTER_API_MODEL);
};

export const getEnableScreenCaptureAsync = async () => {
  return getSettingValueAsync("ENABLE_SCREEN_CAPTURE", CONFIG.ENABLE_SCREEN_CAPTURE);
};

export const getActiveSelectionIconOnTextfieldsAsync = async () => {
  return getSettingValueAsync(
    "ACTIVE_SELECTION_ICON_ON_TEXTFIELDS",
    CONFIG.ACTIVE_SELECTION_ICON_ON_TEXTFIELDS
  );
};

// --- Font Settings Getters ---
export const getTranslationFontFamilyAsync = async () => {
  return getSettingValueAsync("TRANSLATION_FONT_FAMILY", CONFIG.TRANSLATION_FONT_FAMILY);
};

export const getTranslationFontSizeAsync = async () => {
  return getSettingValueAsync("TRANSLATION_FONT_SIZE", CONFIG.TRANSLATION_FONT_SIZE);
};