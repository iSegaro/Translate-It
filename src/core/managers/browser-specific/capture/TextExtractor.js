/**
 * Unified Text Extractor for Screen Capture
 * Supports AI-based extraction (via providers) and local OCR (via Tesseract.js)
 */

import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { toTesseractLanguageCode } from '@/features/screen-capture/utils/ocrLanguageMap.js';

const logger = getScopedLogger(LOG_COMPONENTS.SCREEN_CAPTURE, 'TextExtractor');

class TextExtractor {
  constructor() {
    this.ocrEngine = null;
  }

  /**
   * Extract text from image and translate it
   * @param {string} imageData - Base64 image data
   * @param {Object} options - Extraction and translation options
   * @returns {Promise<Object>} Result with extracted and translated text
   */
  async extractAndTranslate(imageData, options = {}) {
    const { 
      method = 'ocr', 
      provider, 
      sourceLang = 'auto', 
      targetLang = 'en',
      coordinates = null
    } = options;

    try {
      let extractedText = '';

      if (method === 'ai') {
        // AI-based extraction (if provider supports it)
        // This is handled by the provider's translateImage method
        logger.debug('Using AI-based extraction');
        const translationEngine = unifiedTranslationService.translationEngine;
        if (!translationEngine) throw new Error('Translation engine not initialized');

        return await translationEngine.translateImage(imageData, sourceLang, targetLang, provider);
      } else {
        // Local OCR extraction
        logger.debug('Using local OCR extraction');
        extractedText = await this.performOCR(imageData, sourceLang, coordinates);
        
        if (!extractedText || extractedText.trim().length === 0) {
          throw new Error('No text detected in the selected area');
        }

        logger.debug('OCR completed, translating text...');
        
        // Translate the extracted text
        const translationResult = await unifiedTranslationService.translateText(extractedText, {
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          provider: provider,
          mode: options.mode || 'screen-capture'
        });

        return {
          method: 'ocr',
          extractedText,
          translatedText: translationResult.translatedText,
          detectedLanguage: translationResult.sourceLanguage,
          provider: translationResult.provider
        };
      }
    } catch (error) {
      logger.error('Extraction and translation failed:', error);
      throw error;
    }
  }

  /**
   * Perform local OCR using Tesseract.js via Offscreen document
   */
  async performOCR(imageData, sourceLang, coordinates = null) {
    try {
      // Convert extension language code to Tesseract language code
      const tesseractLang = toTesseractLanguageCode(sourceLang);

      // Send to offscreen for OCR
      const response = await browser.runtime.sendMessage({
        target: 'offscreen',
        action: 'OCR_PROCESS',
        data: {
          image: imageData,
          coordinates,
          lang: tesseractLang
        }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'OCR processing failed');
      }

      return response.text;
    } catch (error) {
      logger.error('OCR failed:', error);
      throw error;
    }
  }
}

export const textExtractor = new TextExtractor();
export default textExtractor;
