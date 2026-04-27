/**
 * Global translation state and revert logic for Select Element mode
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { restoreElementDirection } from '@/utils/dom/DomDirectionManager.js';
import { PAGE_TRANSLATION_ATTRIBUTES } from '@/features/page-translation/PageTranslationConstants.js';

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
        originalTextNodesData
      } = translation;

      // Skip if element no longer exists in DOM
      // Use documentElement.contains to support reverting HTML and BODY tags
      if (!document.documentElement.contains(element)) {
        logger.debug('Element no longer in DOM, skipping', { tagName: element?.tagName });
        continue;
      }

      // 1. Restore content - SURGICAL RESTORATION ONLY
      // We NEVER use innerHTML for active page elements as it destroys event listeners, 
      // breaks SPAs, and causes massive layout recalculations.
      if (originalTextNodesData && originalTextNodesData.length > 0) {
        let restoredNodes = 0;
        originalTextNodesData.forEach(({ node, originalText }) => {
          // Verify the node still exists and is attached to the document
          if (node && node.parentNode && document.documentElement.contains(node)) {
            node.nodeValue = originalText;
            restoredNodes++;
          }
        });
        
        if (restoredNodes > 0) {
          revertedCount++;
        } else {
          logger.debug('No valid text nodes found to restore for this element');
        }
      } else {
        logger.debug('Missing originalTextNodesData for surgical revert. Skipping content restoration to preserve page integrity.');
      }

      // 2. Restore direction and styles for the element, its descendants, and its ancestors.
      if (element) {
        // Remove tracking attribute for hover tooltip from element and ALL descendants
        const attr = PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL;
        element.removeAttribute(attr);
        element.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr));

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
