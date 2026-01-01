/**
 * Language Constants and Mappings
 * Shared language name to code mappings used across translation providers
 */

import { AUTO_DETECT_VALUE } from './constants.js';

// Standard language name to code mapping
export const LANGUAGE_NAME_TO_CODE_MAP = {
  afrikaans: "af",
  albanian: "sq",
  arabic: "ar",
  azerbaijani: "az",
  belarusian: "be",
  bengali: "bn",
  bulgarian: "bg",
  catalan: "ca",
  cebuano: "ceb",
  "chinese (simplified)": "zh-CN",
  chinese: "zh-CN",
  croatian: "hr",
  czech: "cs",
  danish: "da",
  dutch: "nl",
  english: "en",
  estonian: "et",
  farsi: "fa",
  persian: "fa",
  filipino: "fil",
  finnish: "fi",
  french: "fr",
  german: "de",
  greek: "el",
  hebrew: "he",
  hindi: "hi",
  hungarian: "hu",
  indonesian: "id",
  italian: "it",
  japanese: "ja",
  kannada: "kn",
  kazakh: "kk",
  korean: "ko",
  latvian: "lv",
  lithuanian: "lt",
  malay: "ms",
  malayalam: "ml",
  marathi: "mr",
  nepali: "ne",
  norwegian: "no",
  odia: "or",
  pashto: "ps",
  polish: "pl",
  portuguese: "pt",
  punjabi: "pa",
  romanian: "ro",
  russian: "ru",
  serbian: "sr",
  sinhala: "si",
  slovak: "sk",
  slovenian: "sl",
  spanish: "es",
  swahili: "sw",
  swedish: "sv",
  tagalog: "tl",
  tamil: "ta",
  telugu: "te",
  thai: "th",
  turkish: "tr",
  ukrainian: "uk",
  urdu: "ur",
  uzbek: "uz",
  vietnamese: "vi",
};

// Reverse mapping: language code to language name
export const LANGUAGE_CODE_TO_NAME_MAP = Object.fromEntries(
  Object.entries(LANGUAGE_NAME_TO_CODE_MAP).map(([name, code]) => [code, name])
);

// Provider-specific language code mappings
export const PROVIDER_LANGUAGE_MAPPINGS = {
  // Google Translate Language Codes
  GOOGLE: LANGUAGE_NAME_TO_CODE_MAP,

  // Bing Translate Language Codes
  BING: {
    auto: "auto-detect",
    af: "af",
    am: "am",
    ar: "ar",
    az: "az",
    bg: "bg",
    bs: "bs",
    ca: "ca",
    cs: "cs",
    cy: "cy",
    da: "da",
    de: "de",
    el: "el",
    en: "en",
    es: "es",
    et: "et",
    fa: "fa",
    fi: "fi",
    fr: "fr",
    ga: "ga",
    gu: "gu",
    hi: "hi",
    hmn: "mww",
    hr: "hr",
    ht: "ht",
    hu: "hu",
    hy: "hy",
    id: "id",
    is: "is",
    it: "it",
    ja: "ja",
    kk: "kk",
    km: "km",
    kn: "kn",
    ko: "ko",
    ku: "ku",
    lo: "lo",
    lt: "lt",
    lv: "lv",
    mg: "mg",
    mi: "mi",
    ml: "ml",
    mr: "mr",
    ms: "ms",
    mt: "mt",
    my: "my",
    ne: "ne",
    nl: "nl",
    no: "nb",
    pa: "pa",
    pl: "pl",
    ps: "ps",
    ro: "ro",
    ru: "ru",
    sk: "sk",
    sl: "sl",
    sm: "sm",
    sq: "sq",
    sr: "sr-Cyrl",
    sv: "sv",
    sw: "sw",
    ta: "ta",
    te: "te",
    th: "th",
    tr: "tr",
    uk: "uk",
    ur: "ur",
    vi: "vi",
    iw: "he", // Hebrew uses 'iw' in Bing
    tl: "fil", // Filipino uses 'fil' in Bing
    pt: "pt",
    "zh-CN": "zh-Hans", // Simplified Chinese
    "zh-TW": "zh-Hant", // Traditional Chinese
  },

  // Yandex Translate Language Codes
  YANDEX: LANGUAGE_NAME_TO_CODE_MAP,

  // DeepL Translate Language Codes (UPPERCASE)
  // Standard languages
  DEEPL: {
    auto: '',
    'bg': 'BG',
    'cs': 'CS',
    'da': 'DA',
    'de': 'DE',
    'el': 'EL',
    'en': 'EN',
    'es': 'ES',
    'et': 'ET',
    'fi': 'FI',
    'fr': 'FR',
    'hu': 'HU',
    'id': 'ID',
    'it': 'IT',
    'ja': 'JA',
    'ko': 'KO',
    'lt': 'LT',
    'lv': 'LV',
    'nb': 'NB',
    'nl': 'NL',
    'pl': 'PL',
    'pt': 'PT',
    'pt-br': 'PT-BR',
    'ro': 'RO',
    'ru': 'RU',
    'sk': 'SK',
    'sl': 'SL',
    'sv': 'SV',
    'tr': 'TR',
    'uk': 'UK',
    'zh': 'ZH',
    'zh-cn': 'ZH',
  },

  // DeepL Beta Languages (require enable_beta_languages parameter)
  DEEPL_BETA: {
    'ace': 'ACE',        // Acehnese
    'af': 'AF',          // Afrikaans
    'an': 'AN',          // Aragonese
    'as': 'AS',          // Assamese
    'ay': 'AY',          // Aymara
    'az': 'AZ',          // Azerbaijani
    'ba': 'BA',          // Bashkir
    'be': 'BE',          // Belarusian
    'bho': 'BHO',        // Bhojpuri
    'bn': 'BN',          // Bengali
    'br': 'BR',          // Breton
    'bs': 'BS',          // Bosnian
    'ca': 'CA',          // Catalan
    'ceb': 'CEB',        // Cebuano
    'ckb': 'CKB',        // Kurdish (Sorani)
    'cy': 'CY',          // Welsh
    'eo': 'EO',          // Esperanto
    'eu': 'EU',          // Basque
    'fa': 'FA',          // Persian (Farsi)
    'ga': 'GA',          // Irish
    'gl': 'GL',          // Galician
    'gn': 'GN',          // Guarani
    'gom': 'GOM',        // Konkani
    'gu': 'GU',          // Gujarati
    'ha': 'HA',          // Hausa
    'hi': 'HI',          // Hindi
    'hr': 'HR',          // Croatian
    'ht': 'HT',          // Haitian Creole
    'hy': 'HY',          // Armenian
    'ig': 'IG',          // Igbo
    'is': 'IS',          // Icelandic
    'jv': 'JV',          // Javanese
    'ka': 'KA',          // Georgian
    'kk': 'KK',          // Kazakh
    'kmr': 'KMR',        // Kurdish (Kurmanji)
    'ky': 'KY',          // Kyrgyz
    'la': 'LA',          // Latin
    'lb': 'LB',          // Luxembourgish
    'lmo': 'LMO',        // Lombard
    'ln': 'LN',          // Lingala
    'mai': 'MAI',        // Maithili
    'mg': 'MG',          // Malagasy
    'mi': 'MI',          // Maori
    'mk': 'MK',          // Macedonian
    'mn': 'MN',          // Mongolian
    'mr': 'MR',          // Marathi
    'ms': 'MS',          // Malay
    'mt': 'MT',          // Maltese
    'my': 'MY',          // Burmese
    'ne': 'NE',          // Nepali
    'oc': 'OC',          // Occitan
    'pag': 'PAG',        // Pangasinan
    'pam': 'PAM',        // Kapampangan
    'prs': 'PRS',        // Dari
    'ps': 'PS',          // Pashto
    'qu': 'QU',          // Quechua
    'sa': 'SA',          // Sanskrit
    'scn': 'SCN',        // Sicilian
    'sq': 'SQ',          // Albanian
    'sr': 'SR',          // Serbian
    'su': 'SU',          // Sundanese
    'sw': 'SW',          // Swahili
    'ta': 'TA',          // Tamil
    'te': 'TE',          // Telugu
    'tg': 'TG',          // Tajik
    'tk': 'TK',          // Turkmen
    'tl': 'TL',          // Tagalog
    'tn': 'TN',          // Tswana
    'ts': 'TS',          // Tsonga
    'tt': 'TT',          // Tatar
    'ur': 'UR',          // Urdu
    'uz': 'UZ',          // Uzbek
    'wo': 'WO',          // Wolof
    'xh': 'XH',          // Xhosa
    'yue': 'YUE',        // Cantonese
  },
};

/**
 * Provider-specific supported language codes
 * Maps each provider to the list of language codes they support
 *
 * IMPORTANT: For providers that use different codes (like browserapi using 'zh' instead of 'zh-CN'),
 * we use canonical codes and a variation mapping to handle different code formats.
 */

/**
 * Canonical language code mapping
 * Maps different code variations to a canonical form for matching
 */
const CANONICAL_CODE_MAP = {
  // Chinese variations - all map to 'zh'
  'zh': 'zh',
  'zhcn': 'zh',     // zh-CN normalized
  'zhtw': 'zh',     // zh-TW normalized
  'zhans': 'zh',    // zh-Hans normalized
  'zhant': 'zh',    // zh-Hant normalized

  // Filipino/Tagalog variations
  'fil': 'fil',
  'tl': 'fil',
};

/**
 * Get canonical code for a language code
 * Handles variations like zh-CN -> zh, tl -> fil
 * @param {string} code - Language code to canonicalize
 * @returns {string} Canonical language code
 */
export function getCanonicalCode(code) {
  if (!code) return code;
  const normalized = code.toLowerCase().replace(/[-_]/g, '');
  return CANONICAL_CODE_MAP[normalized] || normalized;
}

export const PROVIDER_SUPPORTED_LANGUAGES = {
  // Google Translate - supports all standard languages (use values for codes)
  google: Object.values(LANGUAGE_NAME_TO_CODE_MAP),

  // Bing Translate - languages from BING mapping (excluding aliases)
  bing: [
    'af', 'am', 'ar', 'az', 'bg', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en',
    'es', 'et', 'fa', 'fi', 'fr', 'ga', 'gu', 'he', 'hi', 'hr', 'ht', 'hu', 'hy',
    'id', 'is', 'it', 'ja', 'kk', 'km', 'kn', 'ko', 'ku', 'lo', 'lt', 'lv', 'mg',
    'mi', 'ml', 'mr', 'ms', 'mt', 'my', 'ne', 'nl', 'no', 'pa', 'pl', 'ps', 'pt',
    'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr',
    'uk', 'ur', 'vi', 'zh-CN', 'zh-TW'
  ],

  // Yandex Translate - same as Google
  yandex: Object.values(LANGUAGE_NAME_TO_CODE_MAP),

  // Browser API - uses Chrome's built-in translation (from BrowserAPI.js langNameToCodeMap)
  // Using canonical codes for matching
  // Note: Provider might be 'browser', 'browserapi', or 'BrowserAPI' depending on context
  browserapi: [
    'af', 'sq', 'ar', 'az', 'be', 'bn', 'bg', 'ca', 'zh', 'hr', 'cs', 'da', 'nl',
    'en', 'et', 'fa', 'fil', 'fi', 'fr', 'de', 'el', 'he', 'hi', 'hu', 'id', 'it',
    'ja', 'ko', 'lv', 'lt', 'ms', 'no', 'pl', 'pt', 'ro', 'ru', 'sr', 'sk', 'sl',
    'es', 'sv', 'th', 'tr', 'uk', 'vi'
  ],

  // Alias for 'browser' (in case provider name is different)
  browser: [
    'af', 'sq', 'ar', 'az', 'be', 'bn', 'bg', 'ca', 'zh', 'hr', 'cs', 'da', 'nl',
    'en', 'et', 'fa', 'fil', 'fi', 'fr', 'de', 'el', 'he', 'hi', 'hu', 'id', 'it',
    'ja', 'ko', 'lv', 'lt', 'ms', 'no', 'pl', 'pt', 'ro', 'ru', 'sr', 'sk', 'sl',
    'es', 'sv', 'th', 'tr', 'uk', 'vi'
  ],

  // DeepL - standard languages only (when beta is disabled)
  deepl: [
    'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hu', 'id', 'it',
    'ja', 'ko', 'lt', 'lv', 'nb', 'nl', 'pl', 'pt', 'pt-br', 'ro', 'ru', 'sk', 'sl',
    'sv', 'tr', 'uk', 'zh', 'zh-cn'
  ],

  // DeepL with beta languages enabled
  deepl_beta: [
    // Standard languages
    'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hu', 'id', 'it',
    'ja', 'ko', 'lt', 'lv', 'nb', 'nl', 'pl', 'pt', 'pt-br', 'ro', 'ru', 'sk', 'sl',
    'sv', 'tr', 'uk', 'zh', 'zh-cn',
    // Beta languages
    'ace', 'af', 'an', 'as', 'ay', 'az', 'ba', 'be', 'bho', 'bn', 'br', 'bs', 'ca',
    'ceb', 'ckb', 'cy', 'eo', 'eu', 'fa', 'ga', 'gl', 'gn', 'gom', 'gu', 'ha', 'hi',
    'hr', 'ht', 'hy', 'ig', 'is', 'jv', 'ka', 'kk', 'kmr', 'ky', 'la', 'lb', 'lmo',
    'ln', 'mai', 'mg', 'mi', 'mk', 'mn', 'mr', 'ms', 'mt', 'my', 'ne', 'oc', 'pag',
    'pam', 'prs', 'ps', 'qu', 'sa', 'scn', 'sq', 'sr', 'su', 'sw', 'ta', 'te', 'tg',
    'tk', 'tl', 'tn', 'ts', 'tt', 'ur', 'uz', 'wo', 'xh', 'yue'
  ],

  // AI Providers (Gemini, OpenAI, OpenRouter, DeepSeek, WebAI, Custom)
  // These support virtually all languages through LLM capabilities
  gemini: null, // null = supports all languages
  openai: null,
  openrouter: null,
  deepseek: null,
  webai: null,
  custom: null
};

// Utility function to normalize language names
export function normalizeLanguageName(lang) {
  if (!lang || typeof lang !== "string") return "";
  return lang.toLowerCase().trim();
}

// Utility function to get provider-specific language code
export function getProviderLanguageCode(lang, provider = 'GOOGLE') {
  const normalized = normalizeLanguageName(lang);

  // Check provider-specific mapping first
  if (PROVIDER_LANGUAGE_MAPPINGS[provider]?.[normalized]) {
    return PROVIDER_LANGUAGE_MAPPINGS[provider][normalized];
  }

  // Fall back to standard mapping
  if (LANGUAGE_NAME_TO_CODE_MAP[normalized]) {
    const standardCode = LANGUAGE_NAME_TO_CODE_MAP[normalized];
    // Check if provider has a different code for this standard code
    if (PROVIDER_LANGUAGE_MAPPINGS[provider]?.[standardCode]) {
      return PROVIDER_LANGUAGE_MAPPINGS[provider][standardCode];
    }
    return standardCode;
  }

  return normalized; // Return as-is if not found
}

// Enhanced language mappings for AI providers that need more specific names
const AI_ENHANCED_LANGUAGE_MAPPINGS = {
  'ar': 'Arabic (Modern Standard)',
  'zh': 'Chinese (Simplified)',
  'zh-tw': 'Chinese (Traditional)',
  'he': 'Hebrew (Modern)',
  'fa': 'Persian (Farsi)',
};

// Utility function to convert language code to language name (for AI providers)
export function getLanguageNameFromCode(code) {
  if (!code || typeof code !== "string") return "";

  // Handle special cases
  if (code.toLowerCase() === AUTO_DETECT_VALUE) return AUTO_DETECT_VALUE;

  const normalizedCode = code.toLowerCase().trim();

  // Check AI-enhanced mappings first (for better AI provider compatibility)
  if (AI_ENHANCED_LANGUAGE_MAPPINGS[normalizedCode]) {
    return AI_ENHANCED_LANGUAGE_MAPPINGS[normalizedCode];
  }

  // Check reverse mapping
  if (LANGUAGE_CODE_TO_NAME_MAP[normalizedCode]) {
    return LANGUAGE_CODE_TO_NAME_MAP[normalizedCode];
  }

  // If it's already a full name (not in code format), return as-is
  if (normalizedCode.length > 3 && !LANGUAGE_NAME_TO_CODE_MAP[normalizedCode]) {
    return code;
  }

  // Fallback: try to find in original mapping by checking values
  for (const [name, langCode] of Object.entries(LANGUAGE_NAME_TO_CODE_MAP)) {
    if (langCode === normalizedCode) {
      return name;
    }
  }

  return code; // Return as-is if not found
}