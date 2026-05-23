/**
 * Global translation state and revert logic for Select Element mode.
 * Enforces immutable, session-scoped snapshot tracking for absolute concurrency safety.
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
        currentTranslation: null,
        // Immutable, session-scoped snapshots mapping
        snapshots: new Map() // Key: "sessionId:blockId" -> Immutable Snapshot array
      };
    }
    return window.__selectElementTranslationState__;
  }
  // Fallback for non-browser environments (tests/SSR)
  return { 
    translationHistory: [], 
    isTranslating: false,
    currentTranslation: null,
    snapshots: new Map()
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

/**
 * Reverts active translations. Supports session-owned reversion to prevent stale races.
 *
 * @param {string|null} [targetSessionId=null] - The target session ID to revert, or null for all
 * @returns {Promise<number>} Reverted count
 */
export async function revertSelectElementTranslation(targetSessionId = null) {
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
        originalTextNodesData,
        sessionId
      } = translation;

      // Strict Ownership Verification: If a specific targetSessionId is requested,
      // verify it matches the snapshot owner session to prevent stale race conditions.
      if (targetSessionId && sessionId !== targetSessionId) {
        logger.warn(`[Rollback] Revert request skipped: session ID mismatch (Caller: ${targetSessionId}, Owner: ${sessionId})`);
        continue;
      }

      // Skip if element no longer exists in DOM
      if (!document.documentElement.contains(element)) {
        logger.debug('Element no longer in DOM, skipping', { tagName: element?.tagName });
        continue;
      }

      // 1. Restore content - SURGICAL RESTORATION ONLY
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
        logger.debug('Missing originalTextNodesData for surgical revert. Skipping content restoration.');
      }

      // 2. Restore direction and styles
      if (element) {
        const attr = PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL;
        element.removeAttribute(attr);
        element.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr));

        restoreElementDirection(element);
        pageEventBus.emit('hide-translation', { element });
      }
    }

    // Clean up registry history
    if (targetSessionId) {
      globalSelectElementState.translationHistory = globalSelectElementState.translationHistory.filter(
        t => t.sessionId !== targetSessionId
      );
      if (globalSelectElementState.snapshots) {
        // Purge session-scoped snapshots
        for (const key of globalSelectElementState.snapshots.keys()) {
          if (key.startsWith(`${targetSessionId}:`)) {
            globalSelectElementState.snapshots.delete(key);
          }
        }
      }
    } else {
      globalSelectElementState.translationHistory = [];
      if (globalSelectElementState.snapshots) {
        globalSelectElementState.snapshots.clear();
      }
    }

    logger.info(`Reverted ${revertedCount} translations via global function`);
    return revertedCount;
  } catch (error) {
    logger.error('Failed to revert translations via global function', error);
    return revertedCount;
  }
}
