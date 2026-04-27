/**
 * Text Direction Utilities for Element Selection
 * Updated to use the centralized LanguageDetectionService.
 */

import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'textDirection');

/**
 * Check if a language is RTL
 * @param {string} languageCode - Language code or name
 * @returns {boolean} Whether the language is RTL
 */
export function isRTLLanguage(languageCode) {
  return LanguageDetectionService.isRTL(languageCode);
}

/**
 * Get text direction based on target language or content
 * @param {string} targetLanguage - Target language code/name
 * @param {string} text - Text content (fallback analysis)
 * @returns {string} 'rtl' or 'ltr'
 */
export function getTextDirection(targetLanguage, text = '') {
  return LanguageDetectionService.getDirection(text, targetLanguage);
}

/**
 * Detect text direction from actual text content
 * @param {string} text - Text to analyze
 * @param {string} targetLanguage - Optional target language hint
 * @returns {string} 'rtl' or 'ltr'
 */
export function detectTextDirectionFromContent(text = '', targetLanguage = null) {
  return LanguageDetectionService.getDirection(text, targetLanguage);
}

/**
 * Apply container-level direction attribute
 * @param {HTMLElement} element - Container element
 * @param {string} targetLanguage - Target language
 * @param {string} text - Text content
 * @param {Object} options - Additional options
 */
export function applyContainerDirection(element, targetLanguage, text = '', options = {}) {
  if (!element) return;

  const { preserveOriginal = false } = options;
  if (preserveOriginal && !element.dataset.originalDirection) {
    element.dataset.originalDirection = element.dir || '';
  }

  const direction = LanguageDetectionService.getDirection(text, targetLanguage);
  element.dir = direction;
  
  logger.debug(`Applied container-level direction: ${direction}`);
}

/**
 * Restore original element direction
 * @param {HTMLElement} element - Element to restore
 */
export function restoreOriginalDirection(element) {
  if (!element || !element.dataset) return;

  if (element.dataset.originalDirection !== undefined) {
    element.dir = element.dataset.originalDirection || '';
    delete element.dataset.originalDirection;
  }
}

/**
 * Create direction-aware container
 */
export function createDirectionAwareContainer(targetLanguage, text = '', options = {}) {
  const {
    tagName = 'div',
    className = 'immersive-translate-target-wrapper',
    id = ''
  } = options;

  const container = document.createElement(tagName);
  if (className) container.className = className;
  if (id) container.id = id;

  applyContainerDirection(container, targetLanguage, text);
  return container;
}

/**
 * Simplified utility object for common operations
 */
export const ElementDirectionUtils = {
  isRTLLanguage,
  getDirection: getTextDirection,
  detectFromContent: detectTextDirectionFromContent,
  applyDirection: applyContainerDirection,
  restoreDirection: restoreOriginalDirection,
  createContainer: createDirectionAwareContainer
};
