/**
 * Global translation state and revert logic for Select Element mode
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import DOMPurify from 'dompurify';
import { restoreElementDirection } from '@/utils/dom/DomDirectionManager.js';

// Global translation state registry to ensure singleton behavior across chunks
const getGlobalState = () => {
  if (typeof window !== 'undefined') {
    if (!window.__selectElementTranslationState__) {
      window.__selectElementTranslationState__ = {
        translationHistory: [], // Store all translations for proper revert
        isTranslating: false,
        currentTranslation: null
      };
    }
    return window.__selectElementTranslationState__;
  }
  // Fallback for non-browser environments (tests/SSR)
  return { 
    translationHistory: [], 
    isTranslating: false,
    currentTranslation: null
  };
};

export const globalSelectElementState = getGlobalState();

/**
 * Get the global Select Element translation state
 * @returns {Object} Global state object
 */
export function getSelectElementTranslationState() {
  return globalSelectElementState;
}

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
        originalTextNodesData
      } = translation;

      // Skip if element no longer exists in DOM
      // Use documentElement.contains to support reverting HTML and BODY tags
      if (!document.documentElement.contains(element)) {
        logger.debug('Element no longer in DOM, skipping', { tagName: element?.tagName });
        continue;
      }

      // 1. Restore content
      if (originalHTML && element) {
        // SAFETY: If element is HTML or BODY, we must be careful not to destroy the whole document structure
        if (element.tagName === 'HTML' || element.tagName === 'BODY') {
          // For root elements, it's safer to only restore text nodes or use a less destructive method
          if (originalTextNodesData && originalTextNodesData.length > 0) {
            originalTextNodesData.forEach(({ node, originalText }) => {
              if (node && node.parentNode) node.nodeValue = originalText;
            });
          } else {
             // Last resort for root: set innerHTML but skip sanitization that breaks styles
             element.innerHTML = originalHTML;
          }
        } else {
          // Standard element restoration - Direct restoration without aggressive sanitization 
          // that might strip original inline styles or critical attributes.
          element.innerHTML = originalHTML;
        }
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

      // 2. Restore direction and styles for the element, its descendants, and its ancestors.
      if (element) {
        // This function now recursively cleans ancestors up to the body
        restoreElementDirection(element);

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
