/**
 * OCR Language Mapping Utility
 *
 * Provides centralized mapping between extension language codes and Tesseract.js language codes.
 * This is the single source of truth for OCR language code conversions.
 *
 * @module ocrLanguageMap
 */

/**
 * Mapping of extension language codes to Tesseract.js language codes.
 * Keys: Extension language codes (e.g., 'en', 'fa', 'zh-cn')
 * Values: Tesseract.js language codes (e.g., 'eng', 'fas', 'chi_sim')
 */
export const OCR_LANGUAGE_MAP = {
  en: 'eng',
  fa: 'fas',
  fr: 'fra',
  de: 'deu',
  es: 'spa',
  it: 'ita',
  pt: 'por',
  ru: 'rus',
  'zh-cn': 'chi_sim',
  'zh-tw': 'chi_tra',
  ja: 'jpn',
  ko: 'kor',
  ar: 'ara',
  hi: 'hin',
  tr: 'tur',
  nl: 'nld',
  pl: 'pol',
  vi: 'vie',
  id: 'ind',
  th: 'tha',
  af: 'afr',
  am: 'amh',
  as: 'asm',
  az: 'aze',
  be: 'bel',
  bn: 'ben',
  bo: 'bod',
  bs: 'bos',
  br: 'bre',
  bg: 'bul',
  ca: 'cat',
  cs: 'ces',
  cy: 'cym',
  da: 'dan',
  dz: 'dzo',
  el: 'ell',
  eo: 'epo',
  et: 'est',
  eu: 'eus',
  fo: 'fao',
  fi: 'fin',
  fy: 'fry',
  gd: 'gla',
  ga: 'gle',
  gl: 'glg',
  gu: 'guj',
  ht: 'hat',
  he: 'heb',
  hr: 'hrv',
  hu: 'hun',
  hy: 'hye',
  iu: 'iku',
  is: 'isl',
  jv: 'jav',
  ka: 'kat',
  kk: 'kaz',
  km: 'khm',
  ky: 'kir',
  lo: 'lao',
  la: 'lat',
  lv: 'lav',
  lt: 'lit',
  lb: 'ltz',
  ml: 'mal',
  mr: 'mar',
  mk: 'mkd',
  mt: 'mlt',
  mn: 'mon',
  mi: 'mri',
  ms: 'msa',
  my: 'mya',
  ne: 'nep',
  no: 'nor',
  oc: 'oci',
  or: 'ori',
  pa: 'pan',
  ps: 'pus',
  qu: 'que',
  ro: 'ron',
  sa: 'san',
  si: 'sin',
  sk: 'slk',
  sl: 'slv',
  sd: 'snd',
  sq: 'sqi',
  sr: 'srp',
  su: 'sun',
  sw: 'swa',
  sv: 'swe',
  ta: 'tam',
  tt: 'tat',
  te: 'tel',
  tg: 'tgk',
  ti: 'tir',
  to: 'ton',
  ug: 'uig',
  uk: 'ukr',
  ur: 'urd',
  uz: 'uzb',
  yi: 'yid',
  yo: 'yor'
};

/**
 * Full list of supported Tesseract OCR languages with their display names.
 * Based on Tesseract 4.0.0 fast models.
 */
export const SUPPORTED_OCR_LANGUAGES = [
  { code: 'afr', name: 'Afrikaans' },
  { code: 'amh', name: 'Amharic' },
  { code: 'ara', name: 'Arabic' },
  { code: 'asm', name: 'Assamese' },
  { code: 'aze', name: 'Azerbaijani' },
  { code: 'aze_cyrl', name: 'Azerbaijani - Cyrillic' },
  { code: 'bel', name: 'Belarusian' },
  { code: 'ben', name: 'Bengali' },
  { code: 'bod', name: 'Tibetan' },
  { code: 'bos', name: 'Bosnian' },
  { code: 'bre', name: 'Breton' },
  { code: 'bul', name: 'Bulgarian' },
  { code: 'cat', name: 'Catalan; Valencian' },
  { code: 'ceb', name: 'Cebuano' },
  { code: 'ces', name: 'Czech' },
  { code: 'chi_sim', name: 'Chinese - Simplified' },
  { code: 'chi_tra', name: 'Chinese - Traditional' },
  { code: 'chr', name: 'Cherokee' },
  { code: 'cos', name: 'Corsican' },
  { code: 'cym', name: 'Welsh' },
  { code: 'dan', name: 'Danish' },
  { code: 'deu', name: 'German' },
  { code: 'deu_latf', name: 'German (Fraktur Latin)' },
  { code: 'dzo', name: 'Dzongkha' },
  { code: 'ell', name: 'Greek, Modern (1453-)' },
  { code: 'eng', name: 'English' },
  { code: 'enm', name: 'English, Middle (1100-1500)' },
  { code: 'epo', name: 'Esperanto' },
  { code: 'equ', name: 'Math / equation detection module' },
  { code: 'est', name: 'Estonian' },
  { code: 'eus', name: 'Basque' },
  { code: 'fao', name: 'Faroese' },
  { code: 'fas', name: 'Persian' },
  { code: 'fil', name: 'Filipino (old - Tagalog)' },
  { code: 'fin', name: 'Finnish' },
  { code: 'fra', name: 'French' },
  { code: 'frk', name: 'German - Fraktur' },
  { code: 'frm', name: 'French, Middle (ca.1400-1600)' },
  { code: 'fry', name: 'Western Frisian' },
  { code: 'gla', name: 'Scottish Gaelic' },
  { code: 'gle', name: 'Irish' },
  { code: 'glg', name: 'Galician' },
  { code: 'grc', name: 'Greek, Ancient (to 1453)' },
  { code: 'guj', name: 'Gujarati' },
  { code: 'hat', name: 'Haitian; Haitian Creole' },
  { code: 'heb', name: 'Hebrew' },
  { code: 'hin', name: 'Hindi' },
  { code: 'hrv', name: 'Croatian' },
  { code: 'hun', name: 'Hungarian' },
  { code: 'hye', name: 'Armenian' },
  { code: 'iku', name: 'Inuktitut' },
  { code: 'ind', name: 'Indonesian' },
  { code: 'isl', name: 'Icelandic' },
  { code: 'ita', name: 'Italian' },
  { code: 'ita_old', name: 'Italian - Old' },
  { code: 'jav', name: 'Javanese' },
  { code: 'jpn', name: 'Japanese' },
  { code: 'kan', name: 'Kannada' },
  { code: 'kat', name: 'Georgian' },
  { code: 'kat_old', name: 'Georgian - Old' },
  { code: 'kaz', name: 'Kazakh' },
  { code: 'khm', name: 'Central Khmer' },
  { code: 'kir', name: 'Kirghiz; Kyrgyz' },
  { code: 'kmr', name: 'Kurmanji (Kurdish - Latin Script)' },
  { code: 'kor', name: 'Korean' },
  { code: 'kor_vert', name: 'Korean (vertical)' },
  { code: 'lao', name: 'Lao' },
  { code: 'lat', name: 'Latin' },
  { code: 'lav', name: 'Latvian' },
  { code: 'lit', name: 'Lithuanian' },
  { code: 'ltz', name: 'Luxembourgish' },
  { code: 'mal', name: 'Malayalam' },
  { code: 'mar', name: 'Marathi' },
  { code: 'mkd', name: 'Macedonian' },
  { code: 'mlt', name: 'Maltese' },
  { code: 'mon', name: 'Mongolian' },
  { code: 'mri', name: 'Maori' },
  { code: 'msa', name: 'Malay' },
  { code: 'mya', name: 'Burmese' },
  { code: 'nep', name: 'Nepali' },
  { code: 'nld', name: 'Dutch; Flemish' },
  { code: 'nor', name: 'Norwegian' },
  { code: 'oci', name: 'Occitan (post 1500)' },
  { code: 'ori', name: 'Oriya' },
  { code: 'osd', name: 'Orientation and script detection module' },
  { code: 'pan', name: 'Panjabi; Punjabi' },
  { code: 'pol', name: 'Polish' },
  { code: 'por', name: 'Portuguese' },
  { code: 'pus', name: 'Pushto; Pashto' },
  { code: 'que', name: 'Quechua' },
  { code: 'ron', name: 'Romanian; Moldavian; Moldovan' },
  { code: 'rus', name: 'Russian' },
  { code: 'san', name: 'Sanskrit' },
  { code: 'sin', name: 'Sinhala; Sinhalese' },
  { code: 'slk', name: 'Slovak' },
  { code: 'slv', name: 'Slovenian' },
  { code: 'snd', name: 'Sindhi' },
  { code: 'spa', name: 'Spanish; Castilian' },
  { code: 'spa_old', name: 'Spanish; Castilian - Old' },
  { code: 'sqi', name: 'Albanian' },
  { code: 'srp', name: 'Serbian' },
  { code: 'srp_latn', name: 'Serbian - Latin' },
  { code: 'sun', name: 'Sundanese' },
  { code: 'swa', name: 'Swahili' },
  { code: 'swe', name: 'Swedish' },
  { code: 'syr', name: 'Syriac' },
  { code: 'tam', name: 'Tamil' },
  { code: 'tat', name: 'Tatar' },
  { code: 'tel', name: 'Telugu' },
  { code: 'tgk', name: 'Tajik' },
  { code: 'tha', name: 'Thai' },
  { code: 'tir', name: 'Tigrinya' },
  { code: 'ton', name: 'Tonga' },
  { code: 'tur', name: 'Turkish' },
  { code: 'uig', name: 'Uighur; Uyghur' },
  { code: 'ukr', name: 'Ukrainian' },
  { code: 'urd', name: 'Urdu' },
  { code: 'uzb', name: 'Uzbek' },
  { code: 'uzb_cyrl', name: 'Uzbek - Cyrillic' },
  { code: 'vie', name: 'Vietnamese' },
  { code: 'yid', name: 'Yiddish' },
  { code: 'yor', name: 'Yoruba' }
];

/**
 * Convert extension language code to Tesseract.js language code.
 *
 * @param {string} languageCode - Extension language code (e.g., 'en', 'fa', 'zh-cn')
 * @param {string} [fallback='eng'] - Fallback language code if mapping not found
 * @returns {string} Tesseract.js language code
 */
export function toTesseractLanguageCode(languageCode, fallback = 'eng') {
  // Handle special cases
  if (!languageCode || languageCode === 'auto' || languageCode === 'detect') {
    return fallback;
  }

  // If it's already a Tesseract code in our supported list, return it
  if (SUPPORTED_OCR_LANGUAGES.some(l => l.code === languageCode)) {
    return languageCode;
  }

  return OCR_LANGUAGE_MAP[languageCode] || languageCode || fallback;
}

/**
 * Get all supported OCR language codes (Tesseract codes).
 *
 * @returns {string[]} Array of Tesseract language codes
 */
export function getSupportedOCRCanvasCodes() {
  return SUPPORTED_OCR_LANGUAGES.map(l => l.code);
}

/**
 * Check if a language code is supported for OCR.
 *
 * @param {string} languageCode - Extension or Tesseract language code to check
 * @returns {boolean} True if language is supported
 */
export function isLanguageSupported(languageCode) {
  return languageCode in OCR_LANGUAGE_MAP || SUPPORTED_OCR_LANGUAGES.some(l => l.code === languageCode);
}
