// src/utils/languages.js

/*
پرچم‌ها را میتوانید از وبسایت زیر دریافت کنید:
  https://nucleoapp.com/svg-flag-icons

*/

/**
 * Convert language name to language code for TTS
 * @param {string} languageName - Language name like "English", "Farsi"
 * @returns {string} Language code like "en", "fa"
 */
export function getLanguageCodeForTTS(languageName) {
  if (!languageName) return 'en';
  
  // If it's already a code (like "en", "fa"), return as is
  if (languageName.length <= 3) {
    return languageName;
  }
  
  // Find the language in the list
  const language = languageList.find(lang => lang.name === languageName);
  return language ? language.code : 'en'; // Default to English
}

export const languageList = [
  {
    name: "English",
    voiceCode: "en-US",
    promptName: "English",
    code: "en",
    locale: "en",
    flagCode: "gb",
  },
  {
    name: "Farsi",
    voiceCode: "fa-IR",
    promptName: "Farsi",
    code: "fa",
    locale: "fa",
    flagCode: "ir",
  },
  { name: "German", voiceCode: "de-DE", promptName: "German", code: "de" },
  { name: "French", voiceCode: "fr-FR", promptName: "French", code: "fr" },
  {
    name: "Chinese (Simplified)",
    voiceCode: "zh-CN",
    promptName: "Chinese (Simplified)",
    code: "zh",
  },
  {
    name: "Spanish",
    voiceCode: "es-ES",
    promptName: "Spanish",
    code: "es",
  },
  { name: "Hindi", voiceCode: "hi-IN", promptName: "Hindi", code: "hi" },
  { name: "Arabic", voiceCode: "ar-SA", promptName: "Arabic", code: "ar" },
  {
    name: "Bengali",
    voiceCode: "bn-BD",
    promptName: "Bengali",
    code: "bn",
  },
  {
    name: "Portuguese",
    voiceCode: "pt-PT",
    promptName: "Portuguese",
    code: "pt",
  },
  {
    name: "Russian",
    voiceCode: "ru-RU",
    promptName: "Russian",
    code: "ru",
  },
  {
    name: "Japanese",
    voiceCode: "ja-JP",
    promptName: "Japanese",
    code: "ja",
  },
  { name: "Urdu", voiceCode: "ur-PK", promptName: "Urdu", code: "ur" },
  {
    name: "Indonesian",
    voiceCode: "id-ID",
    promptName: "Indonesian",
    code: "id",
  },
  {
    name: "Italian",
    voiceCode: "it-IT",
    promptName: "Italian",
    code: "it",
  },
  {
    name: "Swahili",
    voiceCode: "sw-KE",
    promptName: "Swahili",
    code: "sw",
  },
  {
    name: "Marathi",
    voiceCode: "mr-IN",
    promptName: "Marathi",
    code: "mr",
  },
  { name: "Telugu", voiceCode: "te-IN", promptName: "Telugu", code: "te" },
  { name: "Tamil", voiceCode: "ta-IN", promptName: "Tamil", code: "ta" },
  {
    name: "Turkish",
    voiceCode: "tr-TR",
    promptName: "Turkish",
    code: "tr",
  },
  {
    name: "Vietnamese",
    voiceCode: "vi-VN",
    promptName: "Vietnamese",
    code: "vi",
  },
  { name: "Korean", voiceCode: "ko-KR", promptName: "Korean", code: "ko" },
  { name: "Thai", voiceCode: "th-TH", promptName: "Thai", code: "th" },
  { name: "Malay", voiceCode: "ms-MY", promptName: "Malay", code: "ms" },
  { name: "Polish", voiceCode: "pl-PL", promptName: "Polish", code: "pl" },
  { name: "Dutch", voiceCode: "nl-NL", promptName: "Dutch", code: "nl" },
  {
    name: "Filipino",
    voiceCode: "fil-PH",
    promptName: "Filipino",
    code: "fi",
  },
  {
    name: "Ukrainian",
    voiceCode: "uk-UA",
    promptName: "Ukrainian",
    code: "uk",
  },
  {
    name: "Romanian",
    voiceCode: "ro-RO",
    promptName: "Romanian",
    code: "ro",
  },
  { name: "Greek", voiceCode: "el-GR", promptName: "Greek", code: "el" },
  { name: "Czech", voiceCode: "cs-CZ", promptName: "Czech", code: "cs" },
  {
    name: "Hungarian",
    voiceCode: "hu-HU",
    promptName: "Hungarian",
    code: "hu",
  },
  {
    name: "Swedish",
    voiceCode: "sv-SE",
    promptName: "Swedish",
    code: "sv",
  },
  {
    name: "Norwegian",
    voiceCode: "no-NO",
    promptName: "Norwegian",
    code: "no",
  },
  { name: "Danish", voiceCode: "da-DK", promptName: "Danish", code: "da" },
  {
    name: "Finnish",
    voiceCode: "fi-FI",
    promptName: "Finnish",
    code: "fi",
  },
  { name: "Hebrew", voiceCode: "he-IL", promptName: "Hebrew", code: "he" },
  {
    name: "Afrikaans",
    voiceCode: "af-ZA",
    promptName: "Afrikaans",
    code: "af",
  },
  {
    name: "Albanian",
    voiceCode: "sq-AL",
    promptName: "Albanian",
    code: "sq",
  },
  {
    name: "Bulgarian",
    voiceCode: "bg-BG",
    promptName: "Bulgarian",
    code: "bg",
  },
  {
    name: "Catalan",
    voiceCode: "ca-ES",
    promptName: "Catalan",
    code: "ca",
  },
  {
    name: "Croatian",
    voiceCode: "hr-HR",
    promptName: "Croatian",
    code: "hr",
  },
  {
    name: "Estonian",
    voiceCode: "et-EE",
    promptName: "Estonian",
    code: "et",
  },
  {
    name: "Latvian",
    voiceCode: "lv-LV",
    promptName: "Latvian",
    code: "lv",
  },
  {
    name: "Lithuanian",
    voiceCode: "lt-LT",
    promptName: "Lithuanian",
    code: "lt",
  },
  { name: "Slovak", voiceCode: "sk-SK", promptName: "Slovak", code: "sk" },
  {
    name: "Slovenian",
    voiceCode: "sl-SI",
    promptName: "Slovenian",
    code: "sl",
  },
  {
    name: "Serbian",
    voiceCode: "sr-RS",
    promptName: "Serbian",
    code: "sr",
  },
  {
    name: "Malayalam",
    voiceCode: "ml-IN",
    promptName: "Malayalam",
    code: "ml",
  },
  {
    name: "Kannada",
    voiceCode: "kn-IN",
    promptName: "Kannada",
    code: "kn",
  },
  { name: "Odia", voiceCode: "or-IN", promptName: "Odia", code: "or" },
  {
    name: "Punjabi",
    voiceCode: "pa-IN",
    promptName: "Punjabi",
    code: "pa",
  },
  {
    name: "Sinhala",
    voiceCode: "si-LK",
    promptName: "Sinhala",
    code: "si",
  },
  { name: "Nepali", voiceCode: "ne-NP", promptName: "Nepali", code: "ne" },
  {
    name: "Azerbaijani",
    voiceCode: "az-AZ",
    promptName: "Azerbaijani",
    code: "az",
  },
  {
    name: "Belarusian",
    voiceCode: "be-BY",
    promptName: "Belarusian",
    code: "be",
  },
  { name: "Kazakh", voiceCode: "kk-KZ", promptName: "Kazakh", code: "kk" },
  { name: "Uzbek", voiceCode: "uz-UZ", promptName: "Uzbek", code: "uz" },
  { name: "Pashto", voiceCode: "ps-AF", promptName: "Pashto", code: "ps" },
  {
    name: "Tagalog",
    voiceCode: "tl-PH",
    promptName: "Tagalog",
    code: "tl",
  },
  // Cebuano فاقد کد استاندارد IETF است، ممکن است در برخی از موتورهای TTS پشتیبانی نشود.
  // در صورت نیاز می‌توانید از یک کد مرتبط دیگر یا یک کد عمومی مانند 'en-US' استفاده کنید.
  {
    name: "Cebuano",
    voiceCode: "en-US",
    promptName: "Cebuano",
    code: "en",
  },
];

export const getAvailableLanguages = async () => {
  return languageList.map(lang => ({
    code: lang.code,
    name: lang.name,
    voiceCode: lang.voiceCode,
    promptName: lang.promptName
  }))
}

export const getLanguageByName = (name) => {
  return languageList.find(lang => lang.name === name)
}

export const getLanguageByCode = (code) => {
  return languageList.find(lang => lang.code === code)
}
