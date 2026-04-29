// src/features/translation/providers/BrowserAPI.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'BrowserAPI');

import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { 
  getProviderLanguageCode
} from "@/shared/config/languageConstants.js";
import { ProviderNames } from "./ProviderConstants.js";
import browser from 'webextension-polyfill';

export class browserTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Browser native translation";
  static displayName = "Browser API";

  static detector = null;
  static translators = {};

  constructor() {
    super(ProviderNames.BROWSER_API);
  }

  /**
   * Check if browser Translation APIs are available
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

  _getLangCode(lang) {
    if (!lang || typeof lang !== "string") return "en";
    return getProviderLanguageCode(lang, 'BROWSER');
  }

  /**
   * Detect language using browser Language Detector API
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
        if (!browserTranslateProvider.detector) {
          browserTranslateProvider.detector = await globalThis.LanguageDetector.create();
        }

        const results = await browserTranslateProvider.detector.detect(text);
        
        if (results && results.length > 0 && results[0].confidence > 0.5) {
          logger.info(`Language detected using LanguageDetector: ${results[0].detectedLanguage}`);
          return results[0].detectedLanguage;
        }
      }
    } catch {
      logger.warn('LanguageDetector failed, falling back to browser.i18n.detectLanguage');
    }

    // Fallback to browser.i18n.detectLanguage
    try {
      const detectionResult = await browser.i18n.detectLanguage(text);
      if (detectionResult?.languages && detectionResult.languages.length > 0) {
        const detectedLang = detectionResult.languages[0].language.split("-")[0];
        return detectedLang;
      }
    } catch (error) {
      logger.error('browser.i18n.detectLanguage failed:', error);
    }

    // Final fallback: return English as default
    // Note: LanguageSwappingService now handles all necessary language detection logic
    return "en";
  }

  /**
   * Get or create translator for language pair
   * @param {string} sourceLang - Source language code
   * @param {string} targetLang - Target language code
   * @returns {Promise<Object>} - Translator instance
   */
  async _getTranslator(sourceLang, targetLang) {
    const translatorKey = `${sourceLang}-${targetLang}`;
    
    if (browserTranslateProvider.translators[translatorKey]) {
      return browserTranslateProvider.translators[translatorKey];
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

    // Create new translator
    const translator = await globalThis.Translator.create({
      sourceLanguage: sourceLang,
      targetLanguage: targetLang
    });

    // Cache the translator
    browserTranslateProvider.translators[translatorKey] = translator;
    return translator;
  }

  /**
   * Implementation of the chunk translation using Browser API
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt, segmentCount, chunkIndex, totalChunks) {
    logger.debug(`Translating chunk ${chunkIndex + 1}/${totalChunks} (segments: ${segmentCount}, retry: ${retryAttempt})`);
    
    // Check API availability
    if (!this._isAPIAvailable()) {
      const err = new Error("Chrome Translation API not available. Requires Chrome 138+");
      err.type = ErrorTypes.BROWSER_API_UNAVAILABLE;
      throw err;
    }

    // Detect source language if needed
    const sourceLanguageCode = sourceLang === AUTO_DETECT_VALUE
      ? await this._detectLanguage(chunkTexts.join(' '), sourceLang)
      : this._getLangCode(sourceLang);
    const targetLanguageCode = this._getLangCode(targetLang);

    // Get translator instance
    const translator = await this._getTranslator(sourceLanguageCode, targetLanguageCode);

    // Translate each text in the chunk
    const results = [];
    for (const text of chunkTexts) {
      if (abortController?.signal.aborted) {
        const error = new Error('Translation cancelled');
        error.name = 'AbortError';
        throw error;
      }

      try {
        const result = await translator.translate(text);
        results.push(result);
      } catch (error) {
        logger.error(`[BrowserAPI] Chunk translation failed for segment`, error);
        results.push(text); // Fallback to original
      }
    }

    return results;
  }

  /**
   * Clean up resources
   */
  static cleanup() {
    if (this.detector) {
      try { this.detector.destroy(); } catch { /* ignore */ }
      this.detector = null;
    }

    for (const key in this.translators) {
      if (this.translators[key]) {
        try { this.translators[key].destroy(); } catch { /* ignore */ }
        delete this.translators[key];
      }
    }
  }

  /**
   * Reset session context
   */
  resetSessionContext() {
    browserTranslateProvider.cleanup();
  }
}

export default browserTranslateProvider;
