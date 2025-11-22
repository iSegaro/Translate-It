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