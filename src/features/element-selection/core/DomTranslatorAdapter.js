// DomTranslatorAdapter - Simplified adapter for Select Element translation
// Uses one-shot translation instead of recursive node processing

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getTranslationApiAsync, getTargetLanguageAsync } from '@/config.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { extractTextFromElement } from '../utils/elementHelpers.js';

/**
 * RTL language codes for automatic direction detection
 */
const RTL_LANGUAGES = new Set([
  'ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ckb', 'dv', 'ug',
  'ae', 'arc', 'xh', 'zu'
]);

/**
 * Adapter class that provides one-shot translation for Select Element mode
 * Simplified from domtranslator library usage - no recursive node processing
 */
export class DomTranslatorAdapter extends ResourceTracker {
  constructor() {
    super('dom-translator-adapter');

    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomTranslatorAdapter');

    // State tracking
    this.currentTranslation = null;
    this.isTranslating = false;

    this.logger.debug('DomTranslatorAdapter created');
  }

  /**
   * Initialize the adapter
   */
  async initialize() {
    this.logger.debug('DomTranslatorAdapter initialized');
  }

  /**
   * Translate text content using one-shot translation
   * @param {HTMLElement} element - Element to translate
   * @param {Object} options - Translation options
   * @returns {Promise<Object>} Translation result
   */
  async translateElement(element, options = {}) {
    const {
      onProgress = null,
      onComplete = null,
      onError = null,
    } = options;

    this.logger.operation('Starting element translation (one-shot)');

    try {
      this.isTranslating = true;

      // Notify translation start
      if (onProgress) {
        await onProgress({ status: 'translating', message: 'Translating...' });
      }

      // Store original state before translation
      const originalHTML = element.innerHTML;
      const elementId = this._generateElementId();

      // Extract text content from element
      const text = extractTextFromElement(element);

      if (!text || !text.trim()) {
        this.logger.warn('No text content found in element');
        throw new Error('No translatable text found in element');
      }

      this.logger.debug('Extracted text for translation:', {
        length: text.length,
        preview: text.substring(0, 100),
      });

      // Get provider and target language
      const provider = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();

      // Send single translation request
      const translationRequest = {
        action: MessageActions.TRANSLATE,
        data: {
          text: JSON.stringify([{ text }]),
          provider,
          sourceLanguage: AUTO_DETECT_VALUE,
          targetLanguage,
          mode: TranslationMode.Select_Element,
          options: { rawJsonPayload: true },
        },
        context: 'select-element',
      };

      this.logger.debug('Sending translation request');

      const result = await sendRegularMessage(translationRequest);

      if (!result?.success || !result?.translatedText) {
        throw new Error(result?.error || 'Translation failed');
      }

      // Parse translated text
      let translatedText;
      try {
        const translated = JSON.parse(result.translatedText);
        translatedText = Array.isArray(translated) && translated[0]?.text
          ? translated[0].text
          : result.translatedText;
      } catch {
        translatedText = result.translatedText;
      }

      this.logger.debug('Translation received:', {
        length: translatedText.length,
        preview: translatedText.substring(0, 100),
      });

      // Replace element content with translated text
      // For simple elements, we just replace the text content
      // For complex elements, we replace innerHTML with the translated text wrapped in a span
      if (element.children.length === 0) {
        // Simple element with no children - just replace text
        element.textContent = translatedText;
      } else {
        // Complex element with children - create a text wrapper
        // Clear all content and set translated text
        element.innerHTML = '';
        element.textContent = translatedText;
      }

      // Apply direction attribute based on target language
      this._applyDirectionToElement(element, targetLanguage);

      // Store translation state for revert
      this.currentTranslation = {
        elementId,
        element,
        originalHTML,
        targetLanguage,
        timestamp: Date.now(),
      };

      this.logger.info('Element translation completed', {
        elementId,
        targetLanguage,
        isRTL: RTL_LANGUAGES.has(targetLanguage.toLowerCase().split('-')[0]),
      });

      // Notify completion
      if (onComplete) {
        await onComplete({
          status: 'completed',
          elementId,
          translated: true,
        });
      }

      return {
        success: true,
        elementId,
        element,
        originalHTML,
      };
    } catch (error) {
      this.logger.error('Element translation failed', error);

      // Notify error
      if (onError) {
        await onError({ status: 'error', error });
      }

      throw error;
    } finally {
      this.isTranslating = false;
    }
  }

  /**
   * Revert the last translation
   * @returns {Promise<boolean>} Success status
   */
  async revertTranslation() {
    if (!this.currentTranslation) {
      this.logger.debug('No translation to revert');
      return false;
    }

    try {
      const { element, originalHTML } = this.currentTranslation;

      if (originalHTML && element) {
        // Restore from HTML snapshot
        // eslint-disable-next-line noUnsanitized/property
        element.innerHTML = originalHTML;

        // Remove direction attributes
        element.removeAttribute('dir');
        element.removeAttribute('data-translate-dir');

        // Hide translation overlay via event bus
        pageEventBus.emit('hide-translation', { element });

        this.logger.info('Translation reverted', {
          elementId: this.currentTranslation.elementId,
        });

        this.currentTranslation = null;
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to revert translation', error);
      return false;
    }
  }

  /**
   * Apply direction attribute based on target language
   * @param {HTMLElement} element - Element to apply direction to
   * @param {string} targetLanguage - Target language code
   */
  _applyDirectionToElement(element, targetLanguage) {
    const langCode = targetLanguage.toLowerCase().split('-')[0];
    const isRTL = RTL_LANGUAGES.has(langCode);

    // Set dir attribute on the element
    element.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    element.setAttribute('data-translate-dir', isRTL ? 'rtl' : 'ltr');

    this.logger.debug('Applied direction to element', {
      langCode,
      isRTL,
    });
  }

  /**
   * Generate unique element ID
   * @returns {string} Unique ID
   */
  _generateElementId() {
    return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if currently translating
   * @returns {boolean} Translation status
   */
  isCurrentlyTranslating() {
    return this.isTranslating;
  }

  /**
   * Check if there's a translation to revert
   * @returns {boolean} Has translation state
   */
  hasTranslation() {
    return this.currentTranslation !== null;
  }

  /**
   * Get current translation state
   * @returns {Object|null} Current translation state
   */
  getCurrentTranslation() {
    return this.currentTranslation;
  }

  /**
   * Cancel ongoing translation
   */
  cancelTranslation() {
    if (this.isTranslating) {
      this.logger.debug('Cancelling translation');
      this.isTranslating = false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.debug('Cleaning up DomTranslatorAdapter');

    // Revert any active translation
    if (this.hasTranslation()) {
      await this.revertTranslation();
    }

    // Clear references
    this.currentTranslation = null;

    // Use ResourceTracker cleanup
    super.cleanup();

    this.logger.debug('DomTranslatorAdapter cleanup completed');
  }
}

export default DomTranslatorAdapter;
