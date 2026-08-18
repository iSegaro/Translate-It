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
 * Releases revert records whose owning element is no longer connected.
 * Connected records remain available for explicit user revert.
 */
export function pruneDisconnectedSelectElementTranslations() {
  const history = globalSelectElementState.translationHistory;
  if (!Array.isArray(history) || history.length === 0) return 0;

  const staleSessions = new Set(
    history
      .filter(({ element }) => !element || !element.isConnected)
      .map(({ sessionId }) => sessionId)
      .filter(Boolean)
  );
  if (staleSessions.size === 0) return 0;

  globalSelectElementState.translationHistory = history.filter(({ sessionId, element }) => (
    element?.isConnected !== false && !staleSessions.has(sessionId)
  ));
  for (const key of globalSelectElementState.snapshots?.keys() || []) {
    if ([...staleSessions].some(sessionId => key.startsWith(`${sessionId}:`))) {
      globalSelectElementState.snapshots.delete(key);
    }
  }
  if (globalSelectElementState.currentTranslation && staleSessions.has(globalSelectElementState.currentTranslation.sessionId)) {
    globalSelectElementState.currentTranslation = null;
  }
  return history.length - globalSelectElementState.translationHistory.length;
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

  const logRestoreFailure = (phase, error, details = {}) => {
    logger.error(`[Rollback] ${phase} failed`, { ...details, error });
  };

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
        for (const { node, originalText } of originalTextNodesData) {
          // Verify the node still exists and is attached to the document
          let isAttached = false;
          try {
            isAttached = Boolean(node && node.parentNode && document.documentElement.contains(node));
          } catch (error) {
            logRestoreFailure('Text attachment check', error);
            continue;
          }

          if (!isAttached) continue;

          try {
            node.nodeValue = originalText;
            restoredNodes++;
          } catch (error) {
            logRestoreFailure('Text restoration', error, { tagName: element?.tagName });
          }
        }

        if (restoredNodes === 0) {
          logger.debug('No valid text nodes found to restore for this element');
        }
        if (restoredNodes > 0) {
          revertedCount++;
        }
      } else {
        logger.debug('Missing originalTextNodesData for surgical revert. Skipping content restoration.');
      }

      // 2. Restore direction and styles
      if (!element) continue;

      const attr = PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL;
      try {
        element.removeAttribute(attr);
      } catch (error) {
        logRestoreFailure('Root metadata cleanup', error, { tagName: element.tagName });
      }

      try {
        const descendants = element.querySelectorAll(`[${attr}]`);
        descendants.forEach((descendant) => {
          try {
            descendant.removeAttribute(attr);
          } catch (error) {
            logRestoreFailure('Descendant metadata cleanup', error, { tagName: descendant?.tagName });
          }
        });
      } catch (error) {
        logRestoreFailure('Descendant metadata discovery', error, { tagName: element.tagName });
      }

      try {
        restoreElementDirection(element);
      } catch (error) {
        logRestoreFailure('Direction/style restoration', error, { tagName: element.tagName });
      }

      try {
        pageEventBus.emit('hide-translation', { element });
      } catch (error) {
        logRestoreFailure('Hide translation event', error, { tagName: element.tagName });
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
