// src/config.js
import { ProviderRegistryIds, nameToRegistryId } from '@/features/translation/providers/ProviderConstants.js';
import { storageManager } from '../storage/core/StorageCore.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js';
import { TRANSLATION_HTML, MOBILE_CONSTANTS, TTS_ENGINES } from './constants.js';
import { isMobile } from '@/shared/utils/device.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONFIG, 'config');
logger.info('Config module initialized');

/**
 * Translation Modes synchronized with MessageContexts for architectural consistency
 */
export const TranslationMode = {
  Field: MessageContexts.CONTENT,
  Select_Element: MessageContexts.SELECT_ELEMENT,
  Selection: MessageContexts.SELECTION_MANAGER,
  Dictionary_Translation: MessageContexts.DICTIONARY,
  Popup_Translate: MessageContexts.POPUP,
  Sidepanel_Translate: MessageContexts.SIDEPANEL,
  Mobile_Translate: MessageContexts.MOBILE_TRANSLATE,
  ScreenCapture: MessageContexts.CAPTURE_MANAGER,
  Page: MessageContexts.PAGE_TRANSLATION_BATCH, // Whole page translation
  
  // Legacy aliases for backward compatibility
  LEGACY_FIELD: 'field',
  LEGACY_SELECT_ELEMENT: 'SelectElement',
  LEGACY_SELECT_ELEMENT_UNDERSCORE: 'select_element',
  LEGACY_DICTIONARY: 'dictionary'
};

/**
 * Selection Translation Modes
 */
export const SelectionTranslationMode = {
  IMMEDIATE: 'immediate',
  ON_FAB_CLICK: 'onFabClick',
  ON_CLICK: 'onClick'
};

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

// Detect environment
const isFirefox = typeof __BROWSER__ !== 'undefined' ? __BROWSER__ === 'firefox' : false;
export { isMobile } from '@/shared/utils/device.js';

// Shared configuration (initial defaults)
export const CONFIG = {
  APP_NAME: "Translate It",
  // --- Core Settings ---
  DEBUG_MODE: false,
  COMPONENT_LOG_LEVELS: {}, // Custom log levels per component
  ENABLE_TRANSLATION_HISTORY: true, // Enable/disable translation history
  APPLICATION_LOCALIZE: "en",
  SOURCE_LANGUAGE: "auto",
  TARGET_LANGUAGE: "en",
  LANGUAGE_DETECTION_PREFERENCES: {
    "arabic-script": "fa", // پیش‌فرض: وقتی اسکریپت عربی تشخیص داده شد، اولویت با فارسی باشد
    "chinese-script": "zh-cn", // پیش‌فرض: چینی ساده‌شده
    "devanagari-script": "hi", // پیش‌فرض: هندی
    "latin-script": "none" // پیش‌فرض: هیچکدام (اجازه به تشخیص خودکار پرووایدر)
  },
  THEME: "auto",
  TIMEOUT: 30000,
  selectionTranslationMode: SelectionTranslationMode.ON_CLICK,

  COPY_REPLACE: "replace", // "copy",
  REPLACE_SPECIAL_SITES: true,
  CHANGELOG_URL: "https://raw.githubusercontent.com/iSegaro/Translate-It/main/Changelog.md",


  // --- API Settings ---
  TRANSLATION_API: isFirefox ? ProviderRegistryIds.YANDEX : ProviderRegistryIds.GOOGLE_V2, // gemini, webai, openai, openrouter, deepseek, custom, google, browserapi

  // --- Mode Specific Provider Settings (Generated Dynamically) ---
  MODE_PROVIDERS: Object.fromEntries(
    Object.values(TranslationMode).map(mode => [mode, null])
  ),

  API_KEY: "", // Gemini specific (deprecated, use GEMINI_API_KEY)
  GEMINI_API_KEY: "", // Gemini API keys (newline-separated)
  GEMINI_API_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", // Default Gemini API URL
  GEMINI_MODEL: "gemini-2.5-flash", // Selected Gemini model
  GEMINI_THINKING_ENABLED: false, // Enable/disable thinking for supported models
  GEMINI_MODELS: [
    // Gemini 3.1 Series (NEW - Latest & Most Advanced)
    { value: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent", thinking: { supported: true, controllable: false, defaultEnabled: false } },
    { value: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash-Lite Preview", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent", thinking: { supported: true, controllable: true, defaultEnabled: false } },

    // Gemini 3.0 Series (Advanced)
    { value: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent", thinking: { supported: true, controllable: false, defaultEnabled: false } },
    { value: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent", thinking: { supported: true, controllable: true, defaultEnabled: false } },

    // Gemini 2.5 Series (Stable)
    { value: "gemini-2.5-pro", name: "Gemini 2.5 Pro", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent", thinking: { supported: true, controllable: false, defaultEnabled: false } },
    { value: "gemini-2.5-flash", name: "Gemini 2.5 Flash", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", thinking: { supported: true, controllable: true, defaultEnabled: false } },
    { value: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", thinking: { supported: true, controllable: true, defaultEnabled: false } },

    { value: "custom", name: "Custom Model", custom: true, thinking: { supported: true, controllable: true, defaultEnabled: false } }
  ],
  GOOGLE_TRANSLATE_URL: "https://translate.googleapis.com/translate_a/single",
  GOOGLE_TRANSLATE_V2_URL: "https://translate.google.com/translate_a/single",
  DEEPL_FREE_API_URL: "https://api-free.deepl.com/v2/translate",
  DEEPL_PRO_API_URL: "https://api.deepl.com/v2/translate",
  YANDEX_TRANSLATE_URL: "https://translate.yandex.net/api/v1/tr.json/translate",
  YANDEX_DETECT_URL: "https://translate.yandex.net/api/v1/tr.json/detect",
  MICROSOFT_EDGE_AUTH_URL: "https://edge.microsoft.com/translate/auth",
  MICROSOFT_EDGE_TRANSLATE_URL: "https://api-edge.cognitive.microsofttranslator.com/translate",
  LINGVA_API_URL: "https://lingva.ml",
  WEBAI_API_URL: "http://localhost:6969/translate",
  WEBAI_API_MODEL: "gemini-2.5-flash",
  OPENAI_API_KEY: "",
  OPENAI_API_URL: "https://api.openai.com/v1/chat/completions",
  OPENAI_API_MODEL: "gpt-4o-mini",
  OPENAI_MODELS: [
    // --- OpenAI Reasoning Models (برای حل مسائل پیچیده، ریاضیات و کدنویسی) ---
    { value: "o1", name: "o1" },
    { value: "o1-mini", name: "o1-mini" },
    { value: "o3-mini", name: "o3-mini" },

    // --- OpenAI Omni Series (مدل‌های سریع، ارزان و چندمنظوره) ---
    { value: "gpt-4.5-preview", name: "GPT-4.5 Preview" },
    { value: "gpt-4o", name: "GPT-4o" },
    { value: "chatgpt-4o-latest", name: "ChatGPT-4o Latest" },
    { value: "gpt-4o-mini", name: "GPT-4o Mini" },
    { value: "custom", name: "Custom Model" }
  ],
  OPENROUTER_API_KEY: "",
  OPENROUTER_API_URL: "https://openrouter.ai/api/v1/chat/completions",
  OPENROUTER_API_MODEL: "openai/gpt-4o",
    OPENROUTER_MODELS: [
    // --- OpenAI ---
    { value: "openai/o1", name: "OpenAI o1 (Reasoning)" },
    { value: "openai/o3-mini", name: "OpenAI o3-mini (Reasoning)" },
    { value: "openai/gpt-4.5-preview", name: "OpenAI GPT-4.5 Preview" },
    { value: "openai/gpt-4o", name: "OpenAI GPT-4o" },
    { value: "openai/gpt-4o-mini", name: "OpenAI GPT-4o Mini" },

    // --- Anthropic ---
    { value: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet" },
    { value: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku" },

    // --- DeepSeek ---
    { value: "deepseek/deepseek-r1", name: "DeepSeek R1 (Reasoning)" },
    { value: "deepseek/deepseek-chat", name: "DeepSeek V3 (Chat)" },

    // --- Google ---
    { value: "google/gemini-3.1-pro-preview", name: "Google Gemini 3.1 Pro" },
    { value: "google/gemini-3.1-flash-lite-preview", name: "Google Gemini 3.1 Flash-Lite" },
    { value: "google/gemini-2.5-pro", name: "Google Gemini 2.5 Pro" },
    { value: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash" },

    // --- Meta & Mistral ---
    { value: "meta-llama/llama-3.3-70b-instruct", name: "Meta Llama 3.3 70B" },
    { value: "mistralai/mistral-large", name: "Mistral Large" },

    // --- Free Models (Zero Cost / Rate Limited) ---
    { value: "openrouter/free", name: "OpenRouter Auto-Free" }, // انتخاب خودکار بهترین مدل رایگان
    { value: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nvidia Nemotron 120B (Free)" }, // قدرتمند و عمومی
    { value: "openai/gpt-oss-120b:free", name: "OpenAI OSS 120B (Free)" }, // استدلال و توابع
    { value: "mistralai/devstral-2-2512:free", name: "Mistral Devstral (Free Coding)" }, // تخصصی کدنویسی
    { value: "xiaomi/mimo-v2-flash:free", name: "Xiaomi Mimo V2 (Free Coding)" }, // تخصصی کدنویسی و سریع
    { value: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (Free)" }, // عمومی و محبوب
    { value: "liquidai/lfm-2.5-1.2b-thinking:free", name: "Liquid LFM 2.5 Thinking (Free)" }, // استدلالی و بسیار سریع

    // --- Custom ---
    { value: "custom", name: "Custom Model" }
  ],
  DEEPSEEK_API_KEY: "",
  DEEPSEEK_API_URL: "https://api.deepseek.com/chat/completions",
  DEEPSEEK_API_MODEL: "deepseek-chat",
  DEEPSEEK_MODELS: [
    // --- DeepSeek Official Models ---
    { value: "deepseek-chat", name: "DeepSeek V3 (Chat & Code)" },
    { value: "deepseek-reasoner", name: "DeepSeek R1 (Reasoner)" },

    { value: "custom", name: "Custom Model" }
  ],
  CUSTOM_API_URL: "",
  CUSTOM_API_KEY: "",
  CUSTOM_API_MODEL: "",

  // --- DeepL API Settings ---
  DEEPL_API_KEY: "",
  DEEPL_API_TIER: "free", // 'free' or 'pro'
  DEEPL_FORMALITY: "default", // 'default', 'more', 'less', 'prefer_more', 'prefer_less'
  DEEPL_BETA_LANGUAGES_ENABLED: true, // Enable beta languages support
  DEEPL_API_TIER_OPTIONS: [
    { value: "free", i18nKey: "deepl_api_tier_free" },
    { value: "pro", i18nKey: "deepl_api_tier_pro" }
  ],
  DEEPL_FORMALITY_OPTIONS: [
    { value: "default", i18nKey: "deepl_formality_default" },
    { value: "more", i18nKey: "deepl_formality_more" },
    { value: "less", i18nKey: "deepl_formality_less" },
    { value: "prefer_more", i18nKey: "deepl_formality_prefer_more" },
    { value: "prefer_less", i18nKey: "deepl_formality_prefer_less" }
  ],

  // --- browser Translation API Settings (Chrome 138+) ---
  BROWSER_TRANSLATE_ENABLED: true, // Enable/disable browser Translation API
  BROWSER_TRANSLATE_AUTO_DOWNLOAD: true, // Automatically download language packs when needed

  // --- Translation Activation Settings ---
  EXTENSION_ENABLED: true, // فعال بودن افزونه (کلی)
  TTS_ENGINE: TTS_ENGINES.EDGE, // موتور پیش‌فرض تلفظ صوتی (google یا edge)
  TTS_FALLBACK_ENABLED: true, // استفاده از صدای جایگزین (مثل عربی برای فارسی) در صورت عدم پشتیبانی موتور
  TTS_AUTO_DETECT_ENABLED: true, // تشخیص خودکار زبان متن قبل از پخش صوتی
  SHOW_DESKTOP_FAB: true, // نمایش دکمه دسترسی سریع در دسکتاپ
  SHOW_MOBILE_FAB: true, // نمایش دکمه دسترسی سریع در موبایل
  DESKTOP_FAB_POSITION: { 
    side: 'right', 
    y: -1 
  }, // موقعیت دکمه شناور دسکتاپ (سمت و ارتفاع)
  MOBILE_FAB_POSITION: { 
    side: MOBILE_CONSTANTS.FAB.SIDE.RIGHT, 
    y: MOBILE_CONSTANTS.FAB.DEFAULT_Y 
  }, // موقعیت دکمه شناور موبایل (سمت و ارتفاع)
  TRANSLATE_ON_TEXT_FIELDS: false, // نمایش آیکون ترجمه در فیلدهای متنی
  ENABLE_SHORTCUT_FOR_TEXT_FIELDS: true, // فعال کردن شورتکات Ctrl+/ برای فیلدهای متنی
  TRANSLATE_WITH_SELECT_ELEMENT: true, // فعال کردن ترجمه با انتخاب المان (مثلاً از منوی راست‌کلیک)
  TRANSLATE_ON_TEXT_SELECTION: !isMobile, // فعال کردن ترجمه با انتخاب متن در صفحه (غیرفعال در موبایل)
  REQUIRE_CTRL_FOR_TEXT_SELECTION: false, // نیاز به نگه داشتن Ctrl هنگام انتخاب متن
  ENHANCED_TRIPLE_CLICK_DRAG: false, // فعال کردن پشتیبانی پیشرفته از triple-click + drag
  ENABLE_DICTIONARY: true, // با مکانیزم تشخیص کلمه، بعنوان دیکشنری پاسخ را نمایش میدهد
  ENABLE_SCREEN_CAPTURE: true, // فعال کردن قابلیت Screen Capture Translator
  ACTIVE_SELECTION_ICON_ON_TEXTFIELDS: true, // فعال کردن دوبار کلیک روی متن در فیلدهای متنی
  EXCLUDED_SITES: [], // وب‌سایت‌هایی که افزونه در آن‌ها غیرفعال باشد
  MOBILE_UI_MODE: MOBILE_CONSTANTS.UI_MODE.AUTO, // حالت رابط کاربری موبایل: auto, mobile, desktop
  MOBILE_PAGE_TRANSLATION_AUTO_CLOSE: false, // بستن خودکار شیت پس از شروع ترجمه صفحه در موبایل

  // --- Versioning ---
  PROMPTS_VERSION: 3, // Version of the prompt templates (localized labels for dictionary)

  // --- AI Optimization Settings ---
  OPTIMIZATION_LEVEL: 3, // Default global optimization level (1-5: Cost vs Speed)
  PROVIDER_OPTIMIZATION_LEVELS: {}, // Per-provider level overrides { Gemini: 5, OpenAI: 2 }
  AI_CONTEXT_TRANSLATION_ENABLED: true, // ارسال کانتکست (عنوان صفحه، تیتر بخش) به پرووایدرهای هوشمند
  AI_CONVERSATION_HISTORY_ENABLED: false, // ارسال تاریخچه ترجمه‌های قبلی برای حفظ استایل (مخصوص Select Element)
  BILINGUAL_TRANSLATION: true, // ترجمه دوطرفه: اگر متن ورودی به زبان مقصد بود، آن را به زبان مبدا ترجمه کن
  BILINGUAL_TRANSLATION_MODES: {
    [TranslationMode.Popup_Translate]: true,
    [TranslationMode.Sidepanel_Translate]: true,
    [TranslationMode.Select_Element]: true,
    [TranslationMode.Field]: true,
    [TranslationMode.Selection]: true, // WindowsManager
    [TranslationMode.Page]: false,     // Default disabled for whole page to prevent checkerboarding
    [TranslationMode.Dictionary_Translation]: true,
    [TranslationMode.ScreenCapture]: true
  },

  // --- Whole Page Translation Settings Getters ---
  SMART_CONTEXT_TRANSLATION_ENABLED: true, // Enable/disable smart context and logical batching
  WHOLE_PAGE_TRANSLATION_ENABLED: true, // فعال بودن ترجمه کل صفحه
  WHOLE_PAGE_LAZY_LOADING: true, // فقط translate کردن قسمت‌های visible صفحه
  WHOLE_PAGE_AUTO_TRANSLATE_ON_DOM_CHANGES: true, // ترجمه خودکار وقتی صفحه تغییر می‌کند
  WHOLE_PAGE_EXCLUDED_SELECTORS: [
    "script", "style", "code", "pre", "noscript", "meta", "textarea", "link", "time", "kbd", "svg", "ruby", "rt", "rp", "math", "d-math", "samp",
    `.${TRANSLATION_HTML.NO_TRANSLATE_CLASS}`, "[contenteditable='true']", `[translate='${TRANSLATION_HTML.NO_TRANSLATE_VALUE}']`,
    ".social-share", ".share-nav", "[data-toolbar=share]", ".o-share",
    ".prism-code", ".enlighter-code", ".rc-CodeBlock", "[role=code]", "table.highlight",
    "hypothesis-highlight", ".hypothesis-highlight",
    ".material-icons", "material-icon", "span[class^=material-symbols-]", ".google-symbols", "i.fa", "i[class^=fa-]",
    "visuallyhidden", "[data-translate-ignore]"
  ], // المنت‌هایی که ترجمه نمی‌شوند
  WHOLE_PAGE_ATTRIBUTES_TO_TRANSLATE: ["title", "alt", "placeholder", "label", "value"], // Attributeهایی که بصری هستند و ترجمه می‌شوند
  WHOLE_PAGE_MAX_ELEMENTS: 10000, // حداکثر تعداد المنت برای ترجمه (برای performance)
  WHOLE_PAGE_CHUNK_SIZE: 250, // تعداد nodeها در هر batch request
  WHOLE_PAGE_MAX_CHARS: 5000, // حداکثر کاراکتر در هر درخواست معمولی
  WHOLE_PAGE_AI_MAX_CHARS: 15000, // حداکثر کاراکتر در هر درخواست برای مدل‌های AI
  WHOLE_PAGE_ROOT_MARGIN: '10px', // حاشیه اطراف viewport برای شروع ترجمه lazy
  WHOLE_PAGE_DEBOUNCE_DELAY: 500, // تاخیر برای DOM change debouncing (ms)
  WHOLE_PAGE_MAX_CONCURRENT_REQUESTS: 1, // حداکثر تعداد درخواست‌های همزمان برای ترجمه صفحه
  WHOLE_PAGE_PROGRESS_UPDATE_INTERVAL: 100, // فاصله بین progress updates (ms)
  WHOLE_PAGE_SHOW_ORIGINAL_ON_HOVER: false, // نمایش متن اصلی هنگام hover روی متن ترجمه شده
  SELECT_ELEMENT_SHOW_ORIGINAL_ON_HOVER: false, // نمایش متن اصلی هنگام hover در حالت انتخاب المان
  WHOLE_PAGE_TRANSLATE_AFTER_SCROLL_STOP: false, // ترجمه فقط پس از توقف اسکرول
  WHOLE_PAGE_SCROLL_STOP_DELAY: 500, // تاخیر برای توقف اسکرول (ms)

  // --- Proxy Settings ---
  PROXY_ENABLED: false, // فعال بودن proxy
  PROXY_TYPE: "http", // نوع proxy: http, https, socks
  PROXY_HOST: "", // آدرس proxy server
  PROXY_PORT: 8080, // پورت proxy server
  PROXY_USERNAME: "", // نام کاربری proxy (اختیاری)
  PROXY_PASSWORD: "", // رمز عبور proxy (اختیاری)

  // --- UI & Styling ---
  CONTEXT_MENU_VISIBILITY: {
    PAGE_CONTEXT_SELECT_ELEMENT: true,    // نمایش در کلیک‌راست صفحات
    ACTION_CONTEXT_SELECT_ELEMENT: true,  // نمایش در منوی آیکون افزونه (Action)
    ACTION_CONTEXT_OPTIONS: true,         // نمایش گزینه تنظیمات در منوی آیکون
    ACTION_CONTEXT_SHORTCUTS: true,       // نمایش میانبرهای کیبورد در منوی آیکون
    ACTION_CONTEXT_HELP: true             // نمایش راهنما در منوی آیکون
  },

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

  // --- Prompt Templates ---

  /*--- Start PROMPT_BASE_FIELD ---*/
  PROMPT_BASE_FIELD: `You are a professional translation service. Your task is to accurately and fluently translate text between $_{SOURCE} and $_{TARGET}, or from any other language into $_{TARGET}, depending on the input.

Strictly follow these instructions:
$_{PROMPT_INSTRUCTIONS}

Translation quality requirements:
- Produce fluent, natural, and idiomatic translations as if written by a native speaker.
- Prioritize clarity, tone, and readability over literal or word-for-word translation.
- Maintain the original formatting, structure, and line breaks exactly.
- Do **not** include any additional explanations, comments, markdown, or extra content.

Output only the translated text:

$_{TEXT}
`,
/*--- End PROMPT_BASE_FIELD ---*/

/*--- Start PROMPT_BASE_FIELD_AUTO ---*/
  PROMPT_BASE_FIELD_AUTO: `You are a professional translation service. Your task is to accurately and fluently translate text into $_{TARGET}, or from $_{TARGET} into $_{SOURCE}, depending on the input.

Strictly follow these instructions:
$_{PROMPT_INSTRUCTIONS}

Translation quality requirements:
- Produce fluent, natural, and idiomatic translations as if written by a native speaker.
- Prioritize clarity, tone, and readability over literal or word-for-word translation.
- Maintain the original formatting, structure, and line breaks exactly.
- Do **not** include any additional explanations, comments, markdown, or extra content.

Output only the translated text:

$_{TEXT}
`,
/*--- End PROMPT_BASE_FIELD_AUTO ---*/

/*--- Start PROMPT_BASE_SELECT ---*/
  PROMPT_BASE_SELECT: `Act as a professional JSON translation service. Your task is to accurately and fluently translate text from $_{SOURCE} into $_{TARGET}.

The input is a JSON array of objects with abbreviated keys: "t" (text to translate), "i" (unique ID), "b" (block ID), and "r" (element role).

Strictly follow these instructions:
$_{PROMPT_INSTRUCTIONS}

Specific JSON Rules:
  1. Return a valid JSON array. Do not omit any entries.
  2. Ensure translations are natural and idiomatic.
  3. KEEP "i", "b", and "r" keys and their values UNCHANGED.

Example:
Input: [{"t": "Hello", "i": "n1", "b": "b1", "r": "h1"}]
Output: [{"t": "سلام", "i": "n1", "b": "b1", "r": "h1"}]

CRITICAL - Placeholder Preservation:
  1. Preserve [[AIWC-0]], [[AIWC-1]] exactly.
  2. DO NOT translate placeholders or renumber them.

Return **only** the translated JSON array. No explanations or markdown.

$_{TEXT}
`,
/*--- End PROMPT_BASE_SELECT ---*/


/*--- Start PROMPT_BASE_BATCH ---*/
  PROMPT_BASE_BATCH: `You are an expert translation service. Your task is to translate a batch of texts from $_{SOURCE} to $_{TARGET}.

Strictly follow these instructions:
$_{PROMPT_INSTRUCTIONS}

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

/*--- Start PROMPT_BASE_AI_BATCH ---*/
  PROMPT_BASE_AI_BATCH: `You are an expert translation service. Translate the following JSON data from $_{SOURCE} to $_{TARGET}.

Strictly follow these instructions:
$_{PROMPT_INSTRUCTIONS}

Your response MUST be a valid JSON object containing a "translations" array with the exact same number of items as the input. 
Each item MUST contain the "id" and the translated "text".

CRITICAL - Placeholder Preservation:
  If the text contains placeholders like [[AIWC-0]], copy them exactly as is.

Return ONLY the JSON object, no additional text or markdown.

$_{TEXT}
`,
/*--- End PROMPT_BASE_AI_BATCH ---*/

/*--- Start PROMPT_BASE_AI_BATCH_AUTO ---*/
  PROMPT_BASE_AI_BATCH_AUTO: `You are an expert translation service. Translate the following JSON data into $_{TARGET}.

Strictly follow these instructions:
$_{PROMPT_INSTRUCTIONS}

Your response MUST be a valid JSON object containing a "translations" array with the exact same number of items as the input. 
Each item MUST contain the "id" and the translated "text".

CRITICAL - Placeholder Preservation:
  If the text contains placeholders like [[AIWC-0]], copy them exactly as is.

Return ONLY the JSON object, no additional text or markdown.

$_{TEXT}
`,
/*--- End PROMPT_BASE_AI_BATCH_AUTO ---*/

/*--- Start PROMPT_BASE_AI_FOLLOWUP ---*/
  PROMPT_BASE_AI_FOLLOWUP: `Continue translating the following JSON data from $_{SOURCE} to $_{TARGET}.
  
Strictly follow these instructions:
$_{PROMPT_INSTRUCTIONS}

Maintain the exact same JSON structure (Object with "translations" array) as the previous batch.
Return only the JSON object, no additional text.`,
/*--- End PROMPT_BASE_AI_FOLLOWUP ---*/

/*--- Start PROMPT_BASE_AI_FOLLOWUP_AUTO ---*/
  PROMPT_BASE_AI_FOLLOWUP_AUTO: `Continue translating the following JSON data into $_{TARGET}.

Strictly follow these instructions:
$_{PROMPT_INSTRUCTIONS}

Maintain the exact same JSON structure (Object with "translations" array) as the previous batch.
Return only the JSON object, no additional text.`,
/*--- End PROMPT_BASE_AI_FOLLOWUP_AUTO ---*/


/*--- Start PROMPT_BASE_DICTIONARY ---*/
  PROMPT_BASE_DICTIONARY: `You are a professional dictionary service. Your task is to accurately translate the word or phrase from $_{SOURCE} into $_{TARGET}.

Format your response exactly as follows using Markdown:
[Primary meaning in $_{TARGET} directly on the first line]

- **[Noun in $_{TARGET}]**: Meanings, separated by comma
- **[Verb in $_{TARGET}]**: Meanings, separated by comma
- **[Adjective in $_{TARGET}]**: Meanings, separated by comma
- **[Synonyms label in $_{TARGET}]**: 2-3 common synonyms

Keep it very brief. All labels and content MUST be in $_{TARGET}. No examples or explanations.

Now, please translate:
$_{TEXT}
`,
/*--- End PROMPT_BASE_DICTIONARY ---*/

  /*--- Start PROMPT_BASE_POPUP_TRANSLATE ---*/
  PROMPT_BASE_POPUP_TRANSLATE: `You are a professional translation service. Your task is to accurately and fluently translate the input text into $_{TARGET}, while strictly preserving its structure, formatting, and line breaks.

Strictly follow these instructions:
$_{PROMPT_INSTRUCTIONS}

Translation quality requirements:
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
   - Strictly follow these instructions: $_{PROMPT_INSTRUCTIONS}
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
  PROMPT_TEMPLATE: `- Translate the input text from $_{SOURCE} (or any other language) into $_{TARGET}.
- Ensure the translation is fluent, natural, and idiomatic as if written by a native speaker.
- Prioritize clarity, tone, and readability while preserving the original intent and formatting.
- If the input is already in $_{TARGET}, keep it unchanged or provide a natural refinement if necessary.`,
  /*--- End PROMPT_TEMPLATE ---*/

  /*--- Start PROMPT_TEMPLATE_AUTO ---*/
  PROMPT_TEMPLATE_AUTO: `- Translate the input text into $_{TARGET}.
- Ensure the translation is fluent, natural, and idiomatic as if written by a native speaker.
- Prioritize clarity, tone, and readability while preserving the original intent and formatting.
- If the input is already in $_{TARGET}, translate it into $_{SOURCE} only if the entire context suggests a reverse translation is intended.`,
  /*--- End PROMPT_TEMPLATE_AUTO ---*/
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
    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, 'config-getSettings');
    } else {
      logger.error('config-getSettingsAsync error:', error);
    }
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
    const listener = () => {
      // Storage change detected - logged at TRACE level for detailed debugging
      // logger.debug(`[config.js] Storage change detected via StorageManager: ${data.key} = ${data.newValue}`);
      // StorageManager handles cache updates automatically
      // Any additional processing can be added here if needed
    };

    storageManager.on('change', listener);
    logger.info('[config.js] Storage listener set up successfully');
    
    return listener; // Return listener for cleanup if needed
  } catch (error) {
    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, 'config-initListener');
    } else {
      logger.error('[config.js] Failed to setup storage listener:', error);
    }
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
    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, `config-get-${key}`);
    } else {
      logger.error(`config-getSettingValueAsync-${key} error:`, error);
    }
    return defaultValue;
  }
};

export const getDebugModeAsync = async () => {
  const debugMode = await getSettingValueAsync("DEBUG_MODE", CONFIG.DEBUG_MODE);
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

export const getGeminiModelAsync = async () => {
  return getSettingValueAsync("GEMINI_MODEL", CONFIG.GEMINI_MODEL);
};
export const getGeminiThinkingEnabledAsync = async () => {
  return getSettingValueAsync("GEMINI_THINKING_ENABLED", CONFIG.GEMINI_THINKING_ENABLED);
};

export const getGeminiApiUrlAsync = async () => {
  return getSettingValueAsync("GEMINI_API_URL", CONFIG.GEMINI_API_URL);
};

// Google Translate Specific
export const getGoogleTranslateUrlAsync = async () => {
  return getSettingValueAsync("GOOGLE_TRANSLATE_URL", CONFIG.GOOGLE_TRANSLATE_URL);
};

export const getGoogleTranslateV2UrlAsync = async () => {
  return getSettingValueAsync("GOOGLE_TRANSLATE_V2_URL", CONFIG.GOOGLE_TRANSLATE_V2_URL);
};

// DeepL API Specific
export const getDeeplFreeApiUrlAsync = async () => {
  return getSettingValueAsync("DEEPL_FREE_API_URL", CONFIG.DEEPL_FREE_API_URL);
};

export const getDeeplProApiUrlAsync = async () => {
  return getSettingValueAsync("DEEPL_PRO_API_URL", CONFIG.DEEPL_PRO_API_URL);
};

// Yandex Translate Specific
export const getYandexTranslateUrlAsync = async () => {
  return getSettingValueAsync("YANDEX_TRANSLATE_URL", CONFIG.YANDEX_TRANSLATE_URL);
};

export const getYandexDetectUrlAsync = async () => {
  return getSettingValueAsync("YANDEX_DETECT_URL", CONFIG.YANDEX_DETECT_URL);
};

// Microsoft Edge Specific
export const getMicrosoftEdgeAuthUrlAsync = async () => {
  return getSettingValueAsync("MICROSOFT_EDGE_AUTH_URL", CONFIG.MICROSOFT_EDGE_AUTH_URL);
};

export const getMicrosoftEdgeTranslateUrlAsync = async () => {
  return getSettingValueAsync("MICROSOFT_EDGE_TRANSLATE_URL", CONFIG.MICROSOFT_EDGE_TRANSLATE_URL);
};

// Lingva Translate Specific
export const getLingvaApiUrlAsync = async () => {
  return getSettingValueAsync("LINGVA_API_URL", CONFIG.LINGVA_API_URL);
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

export const getMobileUiModeAsync = async () => {
  return getSettingValueAsync("MOBILE_UI_MODE", CONFIG.MOBILE_UI_MODE);
};

export const getMobilePageTranslationAutoCloseAsync = async () => {
  return getSettingValueAsync("MOBILE_PAGE_TRANSLATION_AUTO_CLOSE", CONFIG.MOBILE_PAGE_TRANSLATION_AUTO_CLOSE);
};

export const getPromptAsync = async () => {
  return getSettingValueAsync("PROMPT_TEMPLATE", CONFIG.PROMPT_TEMPLATE);
};

export const getPromptAutoAsync = async () => {
  return getSettingValueAsync("PROMPT_TEMPLATE_AUTO", CONFIG.PROMPT_TEMPLATE_AUTO);
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

export const getPromptBASEAIBatchAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_AI_BATCH", CONFIG.PROMPT_BASE_AI_BATCH);
};

export const getPromptBASEAIBatchAutoAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_AI_BATCH_AUTO", CONFIG.PROMPT_BASE_AI_BATCH_AUTO);
};

export const getPromptBASEAIFollowupAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_AI_FOLLOWUP", CONFIG.PROMPT_BASE_AI_FOLLOWUP);
};

export const getPromptBASEAIFollowupAutoAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_AI_FOLLOWUP_AUTO", CONFIG.PROMPT_BASE_AI_FOLLOWUP_AUTO);
};

export const getPromptBASEFieldAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_FIELD", CONFIG.PROMPT_BASE_FIELD);
};

export const getPromptBASEFieldAutoAsync = async () => {
  return getSettingValueAsync("PROMPT_BASE_FIELD_AUTO", CONFIG.PROMPT_BASE_FIELD_AUTO);
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

export const getModeProvidersAsync = async () => {
  return getSettingValueAsync("MODE_PROVIDERS", CONFIG.MODE_PROVIDERS);
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

export const getDeepSeekApiUrlAsync = async () => {
  return getSettingValueAsync("DEEPSEEK_API_URL", CONFIG.DEEPSEEK_API_URL);
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

// DeepL Specific
export const getDeeplApiKeyAsync = async () => {
  return getSettingValueAsync("DEEPL_API_KEY", CONFIG.DEEPL_API_KEY);
};

export const getDeeplApiTierAsync = async () => {
  return getSettingValueAsync("DEEPL_API_TIER", CONFIG.DEEPL_API_TIER);
};

export const getDeeplFormalityAsync = async () => {
  return getSettingValueAsync("DEEPL_FORMALITY", CONFIG.DEEPL_FORMALITY);
};

export const getDeeplBetaLanguagesEnabledAsync = async () => {
  return getSettingValueAsync("DEEPL_BETA_LANGUAGES_ENABLED", CONFIG.DEEPL_BETA_LANGUAGES_ENABLED);
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
export const getShowDesktopFabAsync = async () => {
  return getSettingValueAsync(
    "SHOW_DESKTOP_FAB",
    CONFIG.SHOW_DESKTOP_FAB
  );
};

export const getShowMobileFabAsync = async () => {
  return getSettingValueAsync(
    "SHOW_MOBILE_FAB",
    CONFIG.SHOW_MOBILE_FAB
  );
};

export const getDesktopFabPositionAsync = async () => {
  return getSettingValueAsync(
    "DESKTOP_FAB_POSITION",
    CONFIG.DESKTOP_FAB_POSITION
  );
};

export const getMobileFabPositionAsync = async () => {
  return getSettingValueAsync(
    "MOBILE_FAB_POSITION",
    CONFIG.MOBILE_FAB_POSITION
  );
};

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

export const getContextMenuVisibilityAsync = async () => {
  return getSettingValueAsync(
    "CONTEXT_MENU_VISIBILITY",
    CONFIG.CONTEXT_MENU_VISIBILITY
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

// --- Multi-API Key Support (2025) ---
// Import ApiKeyManager for multi-key support
// Using dynamic import to avoid circular dependencies

/**
 * Get all OpenAI API keys as array
 * @returns {Promise<string[]>} - Array of API keys
 */
export const getOpenAIApiKeysAsync = async () => {
  const { ApiKeyManager } = await import("@/features/translation/providers/ApiKeyManager.js");
  return ApiKeyManager.getKeys('OPENAI_API_KEY');
};

/**
 * Get all Gemini API keys as array
 * @returns {Promise<string[]>} - Array of API keys
 */
export const getGeminiApiKeysAsync = async () => {
  const { ApiKeyManager } = await import("@/features/translation/providers/ApiKeyManager.js");
  return ApiKeyManager.getKeys('GEMINI_API_KEY');
};

/**
 * Get all DeepSeek API keys as array
 * @returns {Promise<string[]>} - Array of API keys
 */
export const getDeepSeekApiKeysAsync = async () => {
  const { ApiKeyManager } = await import("@/features/translation/providers/ApiKeyManager.js");
  return ApiKeyManager.getKeys('DEEPSEEK_API_KEY');
};

/**
 * Get all OpenRouter API keys as array
 * @returns {Promise<string[]>} - Array of API keys
 */
export const getOpenRouterApiKeysAsync = async () => {
  const { ApiKeyManager } = await import("@/features/translation/providers/ApiKeyManager.js");
  return ApiKeyManager.getKeys('OPENROUTER_API_KEY');
};

/**
 * Get all DeepL API keys as array
 * @returns {Promise<string[]>} - Array of API keys
 */
export const getDeeplApiKeysAsync = async () => {
  const { ApiKeyManager } = await import("@/features/translation/providers/ApiKeyManager.js");
  return ApiKeyManager.getKeys('DEEPL_API_KEY');
};

/**
 * Get all Custom API keys as array
 * @returns {Promise<string[]>} - Array of API keys
 */
export const getCustomApiKeysAsync = async () => {
  const { ApiKeyManager } = await import("@/features/translation/providers/ApiKeyManager.js");
  return ApiKeyManager.getKeys('CUSTOM_API_KEY');
};

// --- AI Optimization Settings Getters ---
export const getAIContextTranslationEnabledAsync = async () => {
  return getSettingValueAsync(
    "AI_CONTEXT_TRANSLATION_ENABLED",
    CONFIG.AI_CONTEXT_TRANSLATION_ENABLED
  );
};

export const getAIConversationHistoryEnabledAsync = async () => {
  return getSettingValueAsync(
    "AI_CONVERSATION_HISTORY_ENABLED",
    CONFIG.AI_CONVERSATION_HISTORY_ENABLED
  );
};

export const getBilingualTranslationEnabledAsync = async () => {
  return getSettingValueAsync(
    "BILINGUAL_TRANSLATION",
    CONFIG.BILINGUAL_TRANSLATION
  );
};

export const getBilingualTranslationModesAsync = async () => {
  return getSettingValueAsync(
    "BILINGUAL_TRANSLATION_MODES",
    CONFIG.BILINGUAL_TRANSLATION_MODES
  );
};

export const getLanguageDetectionPreferencesAsync = async () => {
  return getSettingValueAsync(
    "LANGUAGE_DETECTION_PREFERENCES",
    CONFIG.LANGUAGE_DETECTION_PREFERENCES
  );
};

/**
 * Get optimization level for a specific provider (1-5)
 * @param {string} providerName 
 * @returns {Promise<number>}
 */
export const getProviderOptimizationLevelAsync = async (providerName) => {
  try {
    const registryId = nameToRegistryId(providerName) || providerName.toLowerCase();
    
    const levels = await getSettingValueAsync("PROVIDER_OPTIMIZATION_LEVELS", CONFIG.PROVIDER_OPTIMIZATION_LEVELS);
    if (levels && levels[registryId]) return parseInt(levels[registryId]);
    if (levels && levels[providerName]) return parseInt(levels[providerName]);
    
    // Fallback to global setting
    return await getSettingValueAsync("OPTIMIZATION_LEVEL", CONFIG.OPTIMIZATION_LEVEL);
  } catch {
    return CONFIG.OPTIMIZATION_LEVEL;
  }
};

// --- Whole Page Translation Settings Getters (NEW) ---
export const getSmartContextTranslationEnabledAsync = async () => {
  return getSettingValueAsync(
    "SMART_CONTEXT_TRANSLATION_ENABLED",
    CONFIG.SMART_CONTEXT_TRANSLATION_ENABLED
  );
};

export const getWholePageTranslationEnabledAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_TRANSLATION_ENABLED",
    CONFIG.WHOLE_PAGE_TRANSLATION_ENABLED
  );
};

export const getWholePageLazyLoadingAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_LAZY_LOADING",
    CONFIG.WHOLE_PAGE_LAZY_LOADING
  );
};

export const getWholePageAutoTranslateOnDOMChangesAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_AUTO_TRANSLATE_ON_DOM_CHANGES",
    CONFIG.WHOLE_PAGE_AUTO_TRANSLATE_ON_DOM_CHANGES
  );
};

export const getWholePageExcludedSelectorsAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_EXCLUDED_SELECTORS",
    CONFIG.WHOLE_PAGE_EXCLUDED_SELECTORS
  );
};

export const getWholePageAttributesToTranslateAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_ATTRIBUTES_TO_TRANSLATE",
    CONFIG.WHOLE_PAGE_ATTRIBUTES_TO_TRANSLATE
  );
};

export const getWholePageMaxElementsAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_MAX_ELEMENTS",
    CONFIG.WHOLE_PAGE_MAX_ELEMENTS
  );
};

export const getWholePageChunkSizeAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_CHUNK_SIZE",
    CONFIG.WHOLE_PAGE_CHUNK_SIZE
  );
};

export const getWholePageDebounceDelayAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_DEBOUNCE_DELAY",
    CONFIG.WHOLE_PAGE_DEBOUNCE_DELAY
  );
};

export const getWholePageRootMarginAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_ROOT_MARGIN",
    CONFIG.WHOLE_PAGE_ROOT_MARGIN
  );
};

export const getWholePageProgressUpdateIntervalAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_PROGRESS_UPDATE_INTERVAL",
    CONFIG.WHOLE_PAGE_PROGRESS_UPDATE_INTERVAL
  );
};

export const getWholePageShowOriginalOnHoverAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_SHOW_ORIGINAL_ON_HOVER",
    CONFIG.WHOLE_PAGE_SHOW_ORIGINAL_ON_HOVER
  );
};

export const getSelectElementShowOriginalOnHoverAsync = async () => {
  return getSettingValueAsync(
    "SELECT_ELEMENT_SHOW_ORIGINAL_ON_HOVER",
    CONFIG.SELECT_ELEMENT_SHOW_ORIGINAL_ON_HOVER
  );
};

export const getWholePageTranslateAfterScrollStopAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_TRANSLATE_AFTER_SCROLL_STOP",
    CONFIG.WHOLE_PAGE_TRANSLATE_AFTER_SCROLL_STOP
  );
};

export const getWholePageScrollStopDelayAsync = async () => {
  return getSettingValueAsync(
    "WHOLE_PAGE_SCROLL_STOP_DELAY",
    CONFIG.WHOLE_PAGE_SCROLL_STOP_DELAY
  );
};