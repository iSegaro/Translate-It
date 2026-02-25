/**
 * Global translation state and revert logic for Select Element mode
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { TEXT_TAGS } from './DomTranslatorConstants.js';

export const globalSelectElementState = {
  translationHistory: [], // Store all translations for proper revert
  isTranslating: false,
};

// Make it available globally for legacy RevertHandler access if needed
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
 * Global function to revert ALL Select Element translations
 * Can be called independently of the Adapter class
 * @returns {Promise<number>} Number of translations reverted
 */
export async function revertSelectElementTranslation() {
  if (!globalSelectElementState.translationHistory || globalSelectElementState.translationHistory.length === 0) {
    return 0;
  }

  const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'GlobalRevert');
  let revertedCount = 0;

  try {
    // Process all translations in reverse order (newest first)
    const translationsToRevert = [...globalSelectElementState.translationHistory].reverse();

    for (const translation of translationsToRevert) {
      const { element, originalHTML, originalTextNodes } = translation;

      // Skip if element no longer exists in DOM
      if (!document.body.contains(element)) {
        logger.debug('Element no longer in DOM, skipping', { element });
        continue;
      }

      if (originalTextNodes && originalTextNodes.length > 0) {
        // Restore each text node individually
        originalTextNodes.forEach(({ node, originalText }) => {
          if (node && node.parentNode) {
            node.nodeValue = originalText;
          }
        });
        revertedCount++;
      } else if (originalHTML && element) {
        element.innerHTML = originalHTML;
        revertedCount++;
      }

      // Clean up directions and styles
      if (element) {
        element.removeAttribute('dir');
        element.removeAttribute('data-translate-dir');
        element.style.textAlign = '';

        const childTextElements = element.querySelectorAll(Array.from(TEXT_TAGS).join(','));
        childTextElements.forEach(child => {
          child.removeAttribute('dir');
          child.style.textAlign = '';
        });

        pageEventBus.emit('hide-translation', { element });
      }
    }

    // Clear history after successful revert
    globalSelectElementState.translationHistory = [];
    logger.info(`Reverted ${revertedCount} translations via global function`);
    return revertedCount;
  } catch (error) {
    logger.error('Failed to revert translations via global function', error);
    return revertedCount;
  }
}
