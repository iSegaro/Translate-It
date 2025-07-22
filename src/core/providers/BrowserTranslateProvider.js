// src/core/providers/BrowserTranslateProvider.js
import { BaseTranslationProvider } from "./BaseTranslationProvider.js";
import { logME } from "../../utils/helpers.js";
import { isPersianText } from "../../utils/textDetection.js";
import { AUTO_DETECT_VALUE } from "tts-utils";
import { ErrorTypes } from "../../services/ErrorTypes.js";

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
    const lowerCaseLang = lang.toLowerCase();
    return langNameToCodeMap[lowerCaseLang] || lowerCaseLang;
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

    try {
      // Create detector if not exists
      if (!BrowserTranslateProvider.detector) {
        BrowserTranslateProvider.detector = await globalThis.LanguageDetector.create();
      }

      const results = await BrowserTranslateProvider.detector.detect(text);
      
      if (results && results.length > 0 && results[0].confidence > 0.5) {
        return results[0].detectedLanguage;
      } else {
        // Fallback to simple regex detection for Persian
        if (isPersianText(text)) {
          return "fa";
        }
        return "en"; // Default to English
      }
    } catch (error) {
      logME(`[${this.providerName}] Language detection failed:`, error);
      
      // Fallback to simple regex detection
      if (isPersianText(text)) {
        return "fa";
      }
      return "en"; // Default to English
    }
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
    const translator = await globalThis.Translator.create({
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (e) => {
          const progress = Math.floor(e.loaded * 100);
          logME(`[${this.providerName}] Language pack download: ${progress}%`);
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

    // --- Language Detection and Processing ---
    let detectedSourceLang = sourceLang;
    
    try {
      detectedSourceLang = await this._detectLanguage(text, sourceLang);
    } catch (error) {
      logME(`[${this.providerName}] Language detection error:`, error);
      detectedSourceLang = this._getLangCode(sourceLang);
    }

    // Convert target language to proper code
    let targetLangCode = this._getLangCode(targetLang);

    // Language swapping logic similar to Google Translate
    if (detectedSourceLang === targetLangCode) {
      [detectedSourceLang, targetLangCode] = [targetLangCode, detectedSourceLang];
    }

    // Skip if same language after detection
    if (detectedSourceLang === targetLangCode) {
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
      const translator = await this._getTranslator(detectedSourceLang, targetLangCode);
      
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