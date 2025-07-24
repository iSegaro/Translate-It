// src/core/providers/BrowserTranslateProvider.js
import { BaseTranslationProvider } from "./BaseTranslationProvider.js";
import { logME } from "../../utils/helpers.js";
import { isPersianText } from "../../utils/textDetection.js";
// import { AUTO_DETECT_VALUE } from "tts-utils";
const AUTO_DETECT_VALUE = 'auto';
import { ErrorTypes } from "../../services/ErrorTypes.js";
import { TranslationMode } from "../../config.js";
import { getBrowser } from "@/utils/browser-polyfill.js";

const TEXT_DELIMITER = "\n\n---\n\n";

// Language code mapping for Browser Translation API (BCP 47 format)
const langNameToCodeMap = {
  afrikaans: "af",
  albanian: "sq", 
  arabic: "ar",
  azerbaijani: "az",
  belarusian: "be",
  bengali: "bn",
  bulgarian: "bg",
  catalan: "ca",
  "chinese (simplified)": "zh",
  chinese: "zh",
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
  korean: "ko",
  latvian: "lv",
  lithuanian: "lt",
  malay: "ms",
  norwegian: "no",
  polish: "pl",
  portuguese: "pt",
  romanian: "ro",
  russian: "ru",
  serbian: "sr",
  slovak: "sk",
  slovenian: "sl",
  spanish: "es",
  swedish: "sv",
  thai: "th",
  turkish: "tr",
  ukrainian: "uk",
  vietnamese: "vi",
};

export class BrowserTranslateProvider extends BaseTranslationProvider {
  static detector = null;
  static translators = {};

  constructor() {
    super("BrowserTranslate");
  }

  /**
   * Check if Browser Translation APIs are available
   * @returns {boolean} - True if APIs are available
   */
  _isAPIAvailable() {
    // Check if we're in a browser environment and APIs exist
    if (typeof globalThis === 'undefined') return false;
    
    // Chrome 138+ APIs
    return (
      typeof globalThis.Translator !== 'undefined' && 
      typeof globalThis.LanguageDetector !== 'undefined'
    );
  }

  /**
   * Check if JSON mode is being used
   * @param {Object} obj - Object to check
   * @returns {boolean} - True if specific JSON format
   */
  _isSpecificTextJsonFormat(obj) {
    return (
      Array.isArray(obj) &&
      obj.length > 0 &&
      obj.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof item.text === "string"
      )
    );
  }

  /**
   * Convert language name to BCP 47 code
   * @param {string} lang - Language name or code
   * @returns {string} - BCP 47 language code
   */
  _getLangCode(lang) {
    if (!lang || typeof lang !== "string") return "en";
    // AUTO_DETECT_VALUE should not reach this function - handled separately
    if (lang === AUTO_DETECT_VALUE) {
      logME(`[${this.providerName}] WARNING: AUTO_DETECT_VALUE reached _getLangCode - this should be handled earlier`);
      return "en";
    }
    const lowerCaseLang = lang.toLowerCase();
    return langNameToCodeMap[lowerCaseLang] || lowerCaseLang;
  }

  /**
   * Detect language for swapping logic (similar to GoogleTranslateProvider)
   * @param {string} text - Text to analyze
   * @param {string} targetLang - Target language for comparison
   * @returns {Promise<string|null>} - Detected language code or null if failed
   */
  async _detectLanguageForSwapping(text, _targetLang) {
    let detectedLangCode = null;
    
    // Try Chrome's built-in LanguageDetector first
    if (typeof globalThis.LanguageDetector !== 'undefined') {
      try {
        if (!BrowserTranslateProvider.detector) {
          BrowserTranslateProvider.detector = await globalThis.LanguageDetector.create();
        }
        const results = await BrowserTranslateProvider.detector.detect(text);
        
        if (results && results.length > 0 && results[0].confidence > 0.5) {
          detectedLangCode = results[0].detectedLanguage;
        }
      } catch (detectorError) {
        logME(`[${this.providerName}] LanguageDetector failed for swapping, trying Browser.i18n fallback:`, detectorError);
      }
    }
    
    // Fallback to Browser.i18n.detectLanguage if LanguageDetector failed
    if (!detectedLangCode) {
      try {
        logME(`[${this.providerName}] Trying Browser.i18n.detectLanguage for swapping...`);
        const detectionResult = await getBrowser().i18n.detectLanguage(text);
        logME(`[${this.providerName}] Browser.i18n.detectLanguage swapping result:`, detectionResult);
        if (detectionResult?.languages && detectionResult.languages.length > 0) {
          detectedLangCode = detectionResult.languages[0].language.split("-")[0];
          const percentage = detectionResult.languages[0].percentage || 0;
          logME(`[${this.providerName}] Detected language for swapping: ${detectedLangCode} (${percentage}% confidence, reliable: ${detectionResult.isReliable})`);
        }
      } catch (i18nError) {
        logME(`[${this.providerName}] Browser.i18n.detectLanguage failed for swapping:`, i18nError);
      }
    }
    
    return detectedLangCode;
  }

  /**
   * Apply language swapping logic if detected language matches target language
   * @param {string} text - Text for regex fallback
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language  
   * @returns {Promise<[string, string]>} - [finalSourceLang, finalTargetLang]
   */
  async _applyLanguageSwapping(text, sourceLang, targetLang) {
    try {
      const detectedLangCode = await this._detectLanguageForSwapping(text, targetLang);
      
      // Apply language swapping if detection successful
      if (detectedLangCode) {
        const targetLangCode = this._getLangCode(targetLang);
        if (detectedLangCode === targetLangCode) {
          // Swap languages similar to Google Translate
          logME(`[${this.providerName}] Languages swapped: ${detectedLangCode} → ${targetLangCode}`);
          return [targetLang, sourceLang];
        }
      } else {
        // Final regex fallback for Persian text
        const targetLangCode = this._getLangCode(targetLang);
        if (isPersianText(text) && (targetLangCode === "fa")) {
          logME(`[${this.providerName}] Languages swapped using regex fallback`);
          return [targetLang, sourceLang];
        }
      }
    } catch (error) {
      logME(`[${this.providerName}] Language detection for swapping failed:`, error);
      // Regex fallback
      const targetLangCode = this._getLangCode(targetLang);
      if (isPersianText(text) && (targetLangCode === "fa")) {
        return [targetLang, sourceLang];
      }
    }

    // No swapping needed
    return [sourceLang, targetLang];
  }

  /**
   * Detect language using Browser Language Detector API
   * @param {string} text - Text to detect language for
   * @param {string} sourceLang - Original source language
   * @returns {Promise<string>} - Detected language code
   */
  async _detectLanguage(text, sourceLang) {
    if (sourceLang !== AUTO_DETECT_VALUE) {
      return this._getLangCode(sourceLang);
    }

    // Try Chrome's built-in LanguageDetector first (if available)
    try {
      if (typeof globalThis.LanguageDetector !== 'undefined') {
        // Create detector if not exists
        if (!BrowserTranslateProvider.detector) {
          BrowserTranslateProvider.detector = await globalThis.LanguageDetector.create();
        }

        const results = await BrowserTranslateProvider.detector.detect(text);
        
        if (results && results.length > 0 && results[0].confidence > 0.5) {
          logME(`[${this.providerName}] Language detected using LanguageDetector: ${results[0].detectedLanguage}`);
          return results[0].detectedLanguage;
        }
      }
    } catch (error) {
      logME(`[${this.providerName}] LanguageDetector failed (${error.message}), falling back to Browser.i18n.detectLanguage`);
    }

    // Fallback to Browser.i18n.detectLanguage (available in all Chrome versions)
    try {
      logME(`[${this.providerName}] Trying Browser.i18n.detectLanguage with text: "${text.substring(0, 50)}..."`);
      const detectionResult = await getBrowser().i18n.detectLanguage(text);
      logME(`[${this.providerName}] Browser.i18n.detectLanguage result:`, detectionResult);
      
      if (detectionResult?.languages && detectionResult.languages.length > 0) {
        const detectedLang = detectionResult.languages[0].language.split("-")[0];
        const percentage = detectionResult.languages[0].percentage || 0;
        logME(`[${this.providerName}] Language detected using Browser.i18n.detectLanguage: ${detectedLang} (${percentage}% confidence, reliable: ${detectionResult.isReliable})`);
        return detectedLang;
      } else {
        logME(`[${this.providerName}] Browser.i18n.detectLanguage result empty`);
      }
    } catch (error) {
      logME(`[${this.providerName}] Browser.i18n.detectLanguage failed:`, error);
    }

    // Final fallback to regex detection
    logME(`[${this.providerName}] Using regex fallback for language detection`);
    if (isPersianText(text)) {
      return "fa";
    }
    return "en"; // Default to English
  }

  /**
   * Get or create translator for language pair
   * @param {string} sourceLang - Source language code
   * @param {string} targetLang - Target language code
   * @returns {Promise<Object>} - Translator instance
   */
  async _getTranslator(sourceLang, targetLang) {
    const translatorKey = `${sourceLang}-${targetLang}`;
    
    if (BrowserTranslateProvider.translators[translatorKey]) {
      return BrowserTranslateProvider.translators[translatorKey];
    }

    // Check availability first
    const availability = await globalThis.Translator.availability({
      sourceLanguage: sourceLang,
      targetLanguage: targetLang
    });

    if (availability === "unavailable") {
      const err = new Error(`Translation not available for ${sourceLang} to ${targetLang}`);
      err.type = ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED;
      err.context = `${this.providerName.toLowerCase()}-availability`;
      throw err;
    }

    // Create new translator with progress monitoring
    const providerName = this.providerName; // Capture this context for callback
    const translator = await globalThis.Translator.create({
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (e) => {
          const progress = Math.floor(e.loaded * 100);
          logME(`[${providerName}] Language pack download: ${progress}%`);
        });
      },
    });

    // Cache the translator
    BrowserTranslateProvider.translators[translatorKey] = translator;
    return translator;
  }

  async translate(text, sourceLang, targetLang, _translateMode = null) {
    // Check API availability first
    if (!this._isAPIAvailable()) {
      const err = new Error("Chrome Translation API not available. Requires Chrome 138+");
      err.type = ErrorTypes.API;
      err.context = `${this.providerName.toLowerCase()}-api-unavailable`;
      throw err;
    }

    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    // --- Language Detection and Swapping (similar to Google Translate) ---
    [sourceLang, targetLang] = await this._applyLanguageSwapping(text, sourceLang, targetLang);

    // اگر در Field mode هستیم، پس از language detection، sourceLang را auto-detect قرار می‌دهیم
    if (_translateMode === TranslationMode.Field) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    // اگر در Subtitle mode هستیم، پس از language detection، sourceLang را auto-detect قرار می‌دهیم
    if (_translateMode === TranslationMode.Subtitle) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    // --- Language Code Conversion ---
    // For BrowserTranslateProvider, we need to handle AUTO_DETECT_VALUE differently
    // than GoogleTranslateProvider because Browser API works with specific language codes
    let sourceLanguageCode, targetLanguageCode;
    
    if (sourceLang === AUTO_DETECT_VALUE) {
      // When auto-detect is requested, detect the language first
      try {
        sourceLanguageCode = await this._detectLanguage(text, sourceLang);
      } catch (error) {
        logME(`[${this.providerName}] Language detection error:`, error);
        sourceLanguageCode = "en"; // fallback
      }
    } else {
      // Use provided source language
      sourceLanguageCode = this._getLangCode(sourceLang);
    }

    // Convert target language to proper code
    targetLanguageCode = this._getLangCode(targetLang);

    // Language swapping logic similar to Google Translate
    if (sourceLanguageCode === targetLanguageCode) {
      [sourceLanguageCode, targetLanguageCode] = [targetLanguageCode, sourceLanguageCode];
    }

    // Skip if same language after detection
    if (sourceLanguageCode === targetLanguageCode) {
      return text;
    }

    // --- JSON Mode Detection ---
    let isJsonMode = false;
    let originalJsonStruct;
    let textsToTranslate = [text];

    try {
      const parsed = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsed)) {
        isJsonMode = true;
        originalJsonStruct = parsed;
        textsToTranslate = originalJsonStruct.map((item) => item.text);
      }
    } catch {
      // Not a valid JSON, proceed in plain text mode.
    }

    // --- Translation Process ---
    try {
      const translator = await this._getTranslator(sourceLanguageCode, targetLanguageCode);
      
      let translatedResults;
      if (isJsonMode) {
        // Translate each text part separately
        translatedResults = [];
        for (const textPart of textsToTranslate) {
          const result = await translator.translate(textPart);
          translatedResults.push(result);
        }
      } else {
        // Translate single text or joined text
        const textToTranslate = textsToTranslate.join(TEXT_DELIMITER);
        const result = await translator.translate(textToTranslate);
        translatedResults = [result];
      }

      // --- Response Processing ---
      if (isJsonMode) {
        if (translatedResults.length !== originalJsonStruct.length) {
          logME(
            `[${this.providerName}] JSON reconstruction failed due to segment mismatch.`
          );
          return translatedResults.join(" "); // Fallback to joined text
        }
        
        const translatedJson = originalJsonStruct.map((item, index) => ({
          ...item,
          text: translatedResults[index]?.trim() || "",
        }));
        return JSON.stringify(translatedJson, null, 2);
      } else {
        if (textsToTranslate.length > 1) {
          // Handle delimiter-separated text
          const parts = translatedResults[0].split(TEXT_DELIMITER);
          if (parts.length === textsToTranslate.length) {
            return parts.join("");
          }
        }
        return translatedResults[0];
      }
    } catch (error) {
      // Enhanced error handling with specific context
      if (error.message?.includes("Translation not available")) {
        error.type = ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED;
        error.context = `${this.providerName.toLowerCase()}-language-unavailable`;
      } else if (error.message?.includes("insufficient")) {
        error.type = ErrorTypes.API;
        error.context = `${this.providerName.toLowerCase()}-insufficient-resources`;
      } else {
        error.type = ErrorTypes.API;
        error.context = `${this.providerName.toLowerCase()}-translation-error`;
      }
      
      logME(`[${this.providerName}] Translation error:`, error);
      throw error;
    }
  }

  /**
   * Clean up resources
   * @static
   */
  static cleanup() {
    // Clean up detector
    if (this.detector) {
      try {
        this.detector.destroy();
      } catch (error) {
        logME("[BrowserTranslate] Error destroying detector:", error);
      }
      this.detector = null;
    }

    // Clean up all translators
    for (const key in this.translators) {
      if (this.translators[key]) {
        try {
          this.translators[key].destroy();
        } catch (error) {
          logME(`[BrowserTranslate] Error destroying translator ${key}:`, error);
        }
        delete this.translators[key];
      }
    }
  }

  /**
   * Reset session context (override parent method)
   */
  resetSessionContext() {
    BrowserTranslateProvider.cleanup();
  }
}
