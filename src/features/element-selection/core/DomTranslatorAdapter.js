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

/**
 * RTL language codes for automatic direction detection
 */
const RTL_LANGUAGES = new Set([
  'ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ckb', 'dv', 'ug',
  'ae', 'arc', 'xh', 'zu'
]);

/**
 * Global translation state for Select Element mode
 * This persists even when SelectElementManager is deactivated
 * so ESC key revert can work properly
 */
const globalSelectElementState = {
  currentTranslation: null,
  isTranslating: false,
};

// Make it available globally for RevertHandler access
if (typeof window !== 'undefined') {
  window.__selectElementTranslationState__ = globalSelectElementState;
}

/**
 * Get the global Select Element translation state
 * @returns {Object} Global state object
 */
export function getSelectElementTranslationState() {
  return globalSelectElementState;
}

/**
 * Adapter class that provides one-shot translation for Select Element mode
 * Simplified from domtranslator library usage - no recursive node processing
 */
export class DomTranslatorAdapter extends ResourceTracker {
  constructor() {
    super('dom-translator-adapter');

    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomTranslatorAdapter');

    // Use global state instead of instance state
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

      // Collect all text nodes within the element
      const textNodes = this._collectTextNodes(element);

      if (textNodes.length === 0) {
        this.logger.warn('No text content found in element');
        throw new Error('No translatable text found in element');
      }

      this.logger.debug('Collected text nodes for translation:', {
        count: textNodes.length,
      });

      // Store original text BEFORE translation for revert
      const originalTextNodesData = textNodes.map(node => ({
        node,
        originalText: node.textContent
      }));

      // Prepare texts for batch translation
      const textsToTranslate = textNodes.map(node => ({
        text: node.textContent.trim()
      })).filter(item => item.text);

      if (textsToTranslate.length === 0) {
        this.logger.warn('No translatable text after filtering');
        throw new Error('No translatable text found in element');
      }

      this.logger.debug('Prepared texts for translation:', {
        count: textsToTranslate.length,
        preview: textsToTranslate.map(t => t.text.substring(0, 30)).join(' | '),
      });

      // Get provider and target language
      const provider = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();

      // Send batch translation request
      const translationRequest = {
        action: MessageActions.TRANSLATE,
        data: {
          text: JSON.stringify(textsToTranslate),
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

      // Parse translated texts
      let translatedTexts;
      try {
        const parsed = JSON.parse(result.translatedText);
        if (Array.isArray(parsed)) {
          translatedTexts = parsed;
        } else if (parsed.text) {
          translatedTexts = [parsed];
        } else {
          throw new Error('Invalid translation response format');
        }
      } catch (error) {
        this.logger.error('Failed to parse translation response', error);
        throw new Error('Invalid translation response format');
      }

      // Validate response length matches input
      if (translatedTexts.length !== textsToTranslate.length) {
        this.logger.warn('Translation count mismatch', {
          expected: textsToTranslate.length,
          received: translatedTexts.length
        });
      }

      this.logger.debug('Translation received:', {
        count: translatedTexts.length,
        preview: translatedTexts.map(t => (t?.text || t)?.substring(0, 30)).join(' | '),
      });

      // Replace each text node's content individually
      let textNodeIndex = 0;
      textNodes.forEach((textNode) => {
        const originalText = textNode.textContent.trim();
        if (!originalText) return;

        if (textNodeIndex < translatedTexts.length) {
          const translatedItem = translatedTexts[textNodeIndex];
          const translatedText = translatedItem?.text || translatedItem || originalText;

          // Preserve leading/trailing whitespace
          const hasLeadingSpace = /^\s/.test(textNode.textContent);
          const hasTrailingSpace = /\s$/.test(textNode.textContent);

          let finalText = translatedText;
          if (hasLeadingSpace) finalText = ' ' + finalText;
          if (hasTrailingSpace) finalText = finalText + ' ';

          textNode.nodeValue = finalText;
          textNodeIndex++;
        }
      });

      // Apply direction attribute based on target language
      this._applyDirectionToElement(element, targetLanguage);

      // Store translation state for revert
      globalSelectElementState.currentTranslation = {
        elementId,
        element,
        originalHTML,  // Keep for full fallback
        originalTextNodes: originalTextNodesData,  // Use original data saved before translation
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
    if (!globalSelectElementState.currentTranslation) {
      this.logger.debug('No translation to revert');
      return false;
    }

    try {
      const { element, originalHTML, originalTextNodes } = globalSelectElementState.currentTranslation;

      if (originalTextNodes && originalTextNodes.length > 0) {
        // Restore each text node individually
        originalTextNodes.forEach(({ node, originalText }) => {
          // Check if node is still in DOM
          if (node.parentNode) {
            node.nodeValue = originalText;
          }
        });

        this.logger.info('Text nodes restored', {
          count: originalTextNodes.length
        });
      } else if (originalHTML && element) {
        // Fallback to full HTML restore
        // eslint-disable-next-line noUnsanitized/property
        element.innerHTML = originalHTML;
      }

      // Remove direction attributes
      element.removeAttribute('dir');
      element.removeAttribute('data-translate-dir');

      // Hide translation overlay via event bus
      pageEventBus.emit('hide-translation', { element });

      this.logger.info('Translation reverted', {
        elementId: globalSelectElementState.currentTranslation.elementId,
      });

      globalSelectElementState.currentTranslation = null;
      return true;
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
   * Collect all text nodes within an element
   * @param {HTMLElement} element - Root element
   * @returns {Text[]} Array of text nodes
   */
  _collectTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip certain element types
        const tagName = parent.tagName;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        // Check visibility
        try {
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
        } catch {
          // If getComputedStyle fails, accept the node
        }

        // Accept nodes with non-whitespace content
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    this.logger.debug(`Collected ${textNodes.length} text nodes for translation`);

    return textNodes;
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
    return globalSelectElementState.currentTranslation !== null;
  }

  /**
   * Get current translation state
   * @returns {Object|null} Current translation state
   */
  getCurrentTranslation() {
    return globalSelectElementState.currentTranslation;
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
    globalSelectElementState.currentTranslation = null;

    // Use ResourceTracker cleanup
    super.cleanup();

    this.logger.debug('DomTranslatorAdapter cleanup completed');
  }
}

/**
 * Global function to revert Select Element translation
 * This can be called from RevertHandler even when SelectElementManager is deactivated
 * @returns {Promise<boolean>} Success status
 */
export async function revertSelectElementTranslation() {
  const state = getSelectElementTranslationState();

  if (!state.currentTranslation) {
    return false;
  }

  try {
    const { element, originalHTML, originalTextNodes } = state.currentTranslation;

    if (originalTextNodes && originalTextNodes.length > 0) {
      // Restore each text node individually
      originalTextNodes.forEach(({ node, originalText }) => {
        // Check if node is still in DOM
        if (node.parentNode) {
          node.nodeValue = originalText;
        }
      });

      const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'GlobalRevert');
      logger.info('Text nodes restored via global function', {
        count: originalTextNodes.length
      });
    } else if (originalHTML && element) {
      // Fallback to full HTML restore
      // eslint-disable-next-line noUnsanitized/property
      element.innerHTML = originalHTML;
    }

    // Remove direction attributes
    element.removeAttribute('dir');
    element.removeAttribute('data-translate-dir');

    // Hide translation overlay via event bus
    pageEventBus.emit('hide-translation', { element });

    // Clear state
    state.currentTranslation = null;

    return true;
  } catch (error) {
    const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'GlobalRevert');
    logger.error('Failed to revert translation via global function', error);
    return false;
  }
}

export default DomTranslatorAdapter;
