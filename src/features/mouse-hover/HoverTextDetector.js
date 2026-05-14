import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ON_HOVER, 'HoverTextDetector');

/**
 * HoverTextDetector - Utility for extracting text under the mouse cursor
 * Supports 'word', 'sentence', and 'container' scopes.
 */
export class HoverTextDetector {
  /**
   * Main entry point to detect text at a point
   * @param {number} x - Client X coordinate
   * @param {number} y - Client Y coordinate
   * @param {string} scope - 'word', 'sentence', or 'container'
   * @returns {Object|null} { text, element, rect } or null
   */
  static detect(x, y, scope = 'sentence') {
    const range = this._getRangeAt(x, y);
    if (!range) return null;

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;

    // Check if the node is empty or just whitespace
    if (!node.textContent.trim()) return null;

    switch (scope) {
      case 'word':
        return this._detectWord(range);
      case 'sentence':
        return this._detectSentence(range);
      case 'container':
        return this._detectContainer(node);
      default:
        return null;
    }
  }

  /**
   * Internal helper to get browser range at point
   * @private
   */
  static _getRangeAt(x, y) {
    try {
      if (document.caretRangeFromPoint) {
        return document.caretRangeFromPoint(x, y);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (!pos) return null;
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
        return range;
      }
    } catch (e) {
      logger.error('Error getting range at point:', e);
    }
    return null;
  }

  /**
   * Extract the word at the given range
   * @private
   */
  static _detectWord(range) {
    const node = range.startContainer;
    const offset = range.startOffset;
    const text = node.textContent;

    // Find word boundaries
    let start = offset;
    while (start > 0 && !this._isSeparator(text[start - 1])) {
      start--;
    }

    let end = offset;
    while (end < text.length && !this._isSeparator(text[end])) {
      end++;
    }

    const word = text.substring(start, end).trim();
    if (!word) return null;

    // Create a range for the word to get its bounding box
    const wordRange = document.createRange();
    wordRange.setStart(node, start);
    wordRange.setEnd(node, end);

    return {
      text: word,
      element: node.parentElement,
      rect: wordRange.getBoundingClientRect()
    };
  }

  /**
   * Extract the sentence at the given range
   * @private
   */
  static _detectSentence(range) {
    const node = range.startContainer;
    const offset = range.startOffset;
    const text = node.textContent;

    // Basic sentence separators
    const separators = /[.!?\n\r]/;

    // Find sentence boundaries within the same text node
    let start = offset;
    while (start > 0 && !separators.test(text[start - 1])) {
      start--;
    }

    let end = offset;
    while (end < text.length && !separators.test(text[end])) {
      end++;
    }

    const sentence = text.substring(start, end).trim();
    if (!sentence) return null;

    const sentenceRange = document.createRange();
    sentenceRange.setStart(node, start);
    sentenceRange.setEnd(node, end);

    return {
      text: sentence,
      element: node.parentElement,
      rect: sentenceRange.getBoundingClientRect()
    };
  }

  /**
   * Extract text from the nearest container
   * @private
   */
  static _detectContainer(node) {
    const element = node.parentElement;
    if (!element) return null;

    // Find the closest meaningful block container
    const blockSelectors = 'p, div, li, h1, h2, h3, h4, h5, h6, article, section, blockquote, td, th';
    const container = element.closest(blockSelectors) || element;

    const text = container.textContent.trim();
    if (!text) return null;

    return {
      text: text,
      element: container,
      rect: container.getBoundingClientRect()
    };
  }

  /**
   * Helper to check for word separators
   * @private
   */
  static _isSeparator(char) {
    return /[\s\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-.\/:;<=>?@\[\]^_`{|}~]/.test(char);
  }
}
