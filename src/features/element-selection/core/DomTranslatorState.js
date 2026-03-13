/**
 * Global translation state and revert logic for Select Element mode
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import DOMPurify from 'dompurify';

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
      const { 
        element, 
        originalHTML, 
        originalTextNodesData, 
        originalDir, 
        originalStyleDirection,
        originalTextAlign, 
        originalDataDir 
      } = translation;

      // Skip if element no longer exists in DOM
      // Use documentElement.contains to support reverting HTML and BODY tags
      if (!document.documentElement.contains(element)) {
        logger.debug('Element no longer in DOM, skipping', { tagName: element?.tagName });
        continue;
      }

      // 1. Restore content (innerHTML is most reliable for restoring attributes/styles of children)
      if (originalHTML && element) {
        // Safe: clear content first (using literal empty string)
        element.innerHTML = '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(DOMPurify.sanitize(originalHTML), 'text/html');
        element.append(...doc.body.childNodes);
        revertedCount++;
      } else if (originalTextNodesData && originalTextNodesData.length > 0) {
        // Fallback to surgical text node restoration if HTML is not available
        originalTextNodesData.forEach(({ node, originalText }) => {
          if (node && node.parentNode) {
            node.nodeValue = originalText;
          }
        });
        revertedCount++;
      }

      // 2. Restore root element's own direction and styles
      if (element) {
        // Restore dir attribute
        if (originalDir !== null && originalDir !== undefined) {
          element.setAttribute('dir', originalDir);
        } else {
          element.removeAttribute('dir');
        }

        // Restore CSS direction
        element.style.direction = originalStyleDirection || '';

        // Restore data-translate-dir
        if (originalDataDir !== null && originalDataDir !== undefined) {
          element.setAttribute('data-translate-dir', originalDataDir);
        } else {
          element.removeAttribute('data-translate-dir');
        }

        // Restore text alignment
        element.style.textAlign = originalTextAlign || '';

        // NOTE: We no longer need to manually clean up children's dir/textAlign
        // because restoring element.innerHTML already replaced them with their original state.

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
