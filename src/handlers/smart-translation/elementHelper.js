/**
 * Helper functions for element detection and recovery
 */
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SmartTranslationElementHelper');

/**
 * Check if element is editable
 * @param {Element} element - Element to check
 * @returns {boolean} Whether element is editable
 */
export function isEditableElement(element) {
  if (!element) return false;
  
  return (
    element.isContentEditable ||
    ["INPUT", "TEXTAREA"].includes(element.tagName) ||
    (element.closest && element.closest('[contenteditable="true"]'))
  );
}

/**
 * Try to recover a target element using various strategies
 * @param {Object} pendingData - The pending translation data containing recovery info
 * @returns {Element|null} The recovered element or null
 */
export function recoverTargetElement(pendingData) {
  // Strategy 1: Try active element
  const activeElement = document.activeElement;
  if (activeElement && isEditableElement(activeElement)) {
    logger.debug('Using active element as fallback target');
    return activeElement;
  }

  // Strategy 2: Try to find by element ID if stored
  if (pendingData?.targetId) {
    const elementById = document.getElementById(pendingData.targetId);
    if (elementById && isEditableElement(elementById)) {
      logger.debug('Recovered target by element ID');
      return elementById;
    }
  }

  // Strategy 3: Try to find by selector if stored
  if (pendingData?.targetSelector) {
    const elements = document.querySelectorAll(pendingData.targetSelector);
    for (const elem of elements) {
      if (isEditableElement(elem)) {
        logger.debug('Recovered target by selector');
        return elem;
      }
    }
  }

  // Strategy 4: Try all editable elements (last resort)
  const editableElements = document.querySelectorAll('input, textarea, [contenteditable="true"]');
  if (editableElements.length === 1) {
    logger.debug('Using single editable element as fallback');
    return editableElements[0];
  }

  return null;
}
