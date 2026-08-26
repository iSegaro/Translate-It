/**
 * Global translation state and revert logic for Select Element mode.
 * Enforces immutable, session-scoped snapshot tracking for absolute concurrency safety.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { restoreElementDirection, restoreNodeDirectionState } from '@/utils/dom/DomDirectionManager.js';
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
        snapshots: new Map(), // Key: "sessionId:blockId" -> Immutable Snapshot array
        // Mutable ownership stacks keyed by DOM identity and property.
        auxiliaryOwnership: new Map(),
        // External drift tombstones prevent older history from being rebuilt.
        auxiliaryInvalidations: new Map()
      };
    }
    return window.__selectElementTranslationState__;
  }
  // Fallback for non-browser environments (tests/SSR)
  return { 
    translationHistory: [], 
    isTranslating: false,
    currentTranslation: null,
    snapshots: new Map(),
    auxiliaryOwnership: new Map(),
    auxiliaryInvalidations: new Map()
  };
};

export const globalSelectElementState = getGlobalState();

function getAuxiliaryOwnershipRegistry() {
  if (!(globalSelectElementState.auxiliaryOwnership instanceof Map)) {
    globalSelectElementState.auxiliaryOwnership = new Map();
  }
  return globalSelectElementState.auxiliaryOwnership;
}

function parseAuxiliaryProperty(property) {
  if (typeof property !== 'string') return null;
  const separator = property.indexOf(':');
  if (separator <= 0 || separator === property.length - 1) return null;

  const kind = property.slice(0, separator);
  if (kind !== 'attribute' && kind !== 'style') return null;
  return { kind, name: property.slice(separator + 1) };
}

function normalizeAuxiliaryState(state, kind) {
  if (!state || typeof state !== 'object' || typeof state.present !== 'boolean') return null;

  if (!state.present) {
    return kind === 'style'
      ? { present: false, value: '', priority: '' }
      : { present: false, value: null };
  }

  if (typeof state.value !== 'string') return null;
  if (kind === 'style' && typeof state.priority !== 'string') return null;
  return kind === 'style'
    ? { present: true, value: state.value, priority: state.priority }
    : { present: true, value: state.value };
}

function cloneAuxiliaryState(state) {
  return { ...state };
}

function readAuxiliaryState(element, property) {
  const parsed = parseAuxiliaryProperty(property);
  if (!parsed || !element) return null;

  if (parsed.kind === 'style') {
    const value = element.style.getPropertyValue(parsed.name);
    return {
      present: value !== '',
      value,
      priority: element.style.getPropertyPriority(parsed.name),
    };
  }

  return {
    present: element.hasAttribute(parsed.name),
    value: element.getAttribute(parsed.name),
  };
}

function auxiliaryStatesEqual(left, right, kind) {
  const normalizedLeft = normalizeAuxiliaryState(left, kind);
  const normalizedRight = normalizeAuxiliaryState(right, kind);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft.present === normalizedRight.present
    && normalizedLeft.value === normalizedRight.value
    && (kind !== 'style' || normalizedLeft.priority === normalizedRight.priority);
}

function writeAuxiliaryState(element, property, state) {
  const parsed = parseAuxiliaryProperty(property);
  const normalizedState = normalizeAuxiliaryState(state, parsed?.kind);
  if (!parsed || !normalizedState || !element) return;

  if (parsed.kind === 'style') {
    if (normalizedState.present) {
      element.style.setProperty(parsed.name, normalizedState.value, normalizedState.priority);
    } else {
      element.style.removeProperty(parsed.name);
    }
    return;
  }

  if (normalizedState.present) element.setAttribute(parsed.name, normalizedState.value);
  else element.removeAttribute(parsed.name);
}

function getAuxiliaryBucket(element, property, create = false) {
  const registry = getAuxiliaryOwnershipRegistry();
  let properties = registry.get(element);
  if (!properties && create) {
    properties = new Map();
    registry.set(element, properties);
  }
  if (!properties) return null;

  let owners = properties.get(property);
  if (!owners && create) {
    owners = [];
    properties.set(property, owners);
  }
  return owners || null;
}

function compactAuxiliaryOwnershipRegistry() {
  const registry = getAuxiliaryOwnershipRegistry();
  for (const [element, properties] of registry) {
    for (const [property, owners] of properties) {
      if (owners.length === 0) properties.delete(property);
    }
    if (properties.size === 0) registry.delete(element);
  }
}

function removeAuxiliaryOwnership(sessionId) {
  if (!sessionId) return;
  const registry = getAuxiliaryOwnershipRegistry();
  for (const [element, properties] of registry) {
    for (const [property, owners] of properties) {
      const remaining = owners.filter(owner => owner.sessionId !== sessionId);
      if (remaining.length > 0) properties.set(property, remaining);
      else properties.delete(property);
    }
    if (properties.size === 0) registry.delete(element);
  }
}

function getAuxiliaryInvalidationRegistry() {
  if (!(globalSelectElementState.auxiliaryInvalidations instanceof Map)) {
    globalSelectElementState.auxiliaryInvalidations = new Map();
  }
  return globalSelectElementState.auxiliaryInvalidations;
}

function isAuxiliaryPropertyInvalidated(element, property) {
  return getAuxiliaryInvalidationRegistry().get(element)?.has(property) || false;
}

function invalidateAuxiliaryProperty(element, property) {
  const registry = getAuxiliaryInvalidationRegistry();
  let properties = registry.get(element);
  if (!properties) {
    properties = new Set();
    registry.set(element, properties);
  }
  properties.add(property);

  const owners = getAuxiliaryBucket(element, property);
  if (owners) owners.splice(0, owners.length);
  compactAuxiliaryOwnershipRegistry();
}

function compactAuxiliaryInvalidations() {
  const registry = getAuxiliaryInvalidationRegistry();
  const history = globalSelectElementState.translationHistory || [];
  for (const [element, properties] of registry) {
    for (const property of properties) {
      const stillReferenced = history.some(entry => (
        Array.isArray(entry?.auxiliaryOwnershipRecords)
        && entry.auxiliaryOwnershipRecords.some(record => (
          record?.element === element && record.property === property
        ))
      ));
      if (!stillReferenced) properties.delete(property);
    }
    if (properties.size === 0) registry.delete(element);
  }
}

function synchronizeAuxiliaryOwnership() {
  const history = globalSelectElementState.translationHistory || [];
  for (const entry of history) {
    if (!entry?.sessionId || !Array.isArray(entry.auxiliaryOwnershipRecords)) continue;

    for (const record of entry.auxiliaryOwnershipRecords) {
      const parsed = parseAuxiliaryProperty(record?.property);
      const original = normalizeAuxiliaryState(record?.original, parsed?.kind);
      const applied = normalizeAuxiliaryState(record?.applied, parsed?.kind);
      if (!parsed || !record?.element || !original || !applied) continue;
      if (isAuxiliaryPropertyInvalidated(record.element, record.property)) continue;

      const owners = getAuxiliaryBucket(record.element, record.property, true);
      const existing = owners.find(owner => owner.sessionId === entry.sessionId);
      if (existing) {
        existing.applied = cloneAuxiliaryState(applied);
      } else {
        owners.push({
          sessionId: entry.sessionId,
          element: record.element,
          property: record.property,
          original: cloneAuxiliaryState(original),
          applied: cloneAuxiliaryState(applied),
        });
      }
    }
  }
}

function restoreOwnedAuxiliaryRecords(sessionId, records, logger) {
  for (const record of [...records].reverse()) {
    const parsed = parseAuxiliaryProperty(record?.property);
    if (!parsed || !record?.element) continue;

    const owners = getAuxiliaryBucket(record.element, record.property);
    if (!owners) continue;
    const ownerIndex = owners.findIndex(owner => owner.sessionId === sessionId);
    if (ownerIndex < 0 || ownerIndex !== owners.length - 1) continue;

    const owner = owners[ownerIndex];
    try {
      if (!record.element.isConnected) continue;

      const current = readAuxiliaryState(record.element, record.property);
      if (!auxiliaryStatesEqual(current, owner.applied, parsed.kind)) {
        logger.debug('Skipping externally changed auxiliary property during revert', {
          property: record.property,
          tagName: record.element.tagName,
        });
        invalidateAuxiliaryProperty(record.element, record.property);
        continue;
      }

      writeAuxiliaryState(record.element, record.property, owner.original);
    } catch (error) {
      logger.error('[Rollback] Auxiliary property restoration failed', {
        property: record.property,
        element: record.element,
        error,
      });
    } finally {
      owners.splice(ownerIndex, 1);
    }
  }
  compactAuxiliaryOwnershipRegistry();
}

function restoreMetadataSnapshot(snapshot, logger) {
  const element = snapshot?.element;
  if (!element?.isConnected) return;

  try {
    if (snapshot.present) element.setAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL, snapshot.value);
    else element.removeAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL);
  } catch (error) {
    logger.error('[Rollback] Metadata restoration failed', { element, error });
  }
}

/**
 * Get the global Select Element translation state
 * @returns {Object} Global state object
 */
export function getSelectElementTranslationState() {
  return globalSelectElementState;
}

/**
 * Publishes exact text and auxiliary property state for successfully committed
 * nodes without mutating source snapshots captured before translation.
 *
 * @param {string} sessionId - Translation generation owner
 * @param {Array<{node: Node, appliedText: string}>} ownershipRecords - Committed node values
 * @param {Array<{element: Element, property: string, original: Object, applied: Object}>} auxiliaryRecords - Committed auxiliary state
 * @returns {boolean} Whether ownership was published
 */
export function publishSelectElementTranslationOwnership(
  sessionId,
  ownershipRecords = [],
  auxiliaryRecords = []
) {
  if (
    !sessionId
    || !Array.isArray(ownershipRecords)
    || !Array.isArray(auxiliaryRecords)
    || (ownershipRecords.length === 0 && auxiliaryRecords.length === 0)
  ) return false;

  const history = globalSelectElementState.translationHistory;
  const historyIndex = history.findIndex(entry => entry.sessionId === sessionId);
  if (historyIndex < 0) return false;

  const ownershipByNode = new Map();
  for (const record of ownershipRecords) {
    if (!record?.node || typeof record.appliedText !== 'string') return false;
    ownershipByNode.set(record.node, record.appliedText);
  }

  const entry = history[historyIndex];
  const snapshots = Array.isArray(entry.originalTextNodesData) ? entry.originalTextNodesData : [];
  const snapshotNodes = new Set(snapshots.map(snapshot => snapshot?.node));
  if ([...ownershipByNode.keys()].some(node => !snapshotNodes.has(node))) return false;

  const updatedSnapshots = snapshots.map(snapshot => {
    if (!ownershipByNode.has(snapshot.node)) return snapshot;
    return Object.freeze({
      ...snapshot,
      appliedText: ownershipByNode.get(snapshot.node),
    });
  });

  const incomingAuxiliary = new Map();
  for (const record of auxiliaryRecords) {
    const parsed = parseAuxiliaryProperty(record?.property);
    const original = normalizeAuxiliaryState(record?.original, parsed?.kind);
    const applied = normalizeAuxiliaryState(record?.applied, parsed?.kind);
    if (!parsed || !record?.element || !original || !applied) return false;

    let byProperty = incomingAuxiliary.get(record.element);
    if (!byProperty) {
      byProperty = new Map();
      incomingAuxiliary.set(record.element, byProperty);
    }
    byProperty.set(record.property, {
      element: record.element,
      property: record.property,
      original,
      applied,
    });
  }

  const existingAuxiliary = Array.isArray(entry.auxiliaryOwnershipRecords)
    ? entry.auxiliaryOwnershipRecords
    : [];
  const mergedAuxiliary = new Map();
  for (const record of existingAuxiliary) {
    const parsed = parseAuxiliaryProperty(record?.property);
    const original = normalizeAuxiliaryState(record?.original, parsed?.kind);
    const applied = normalizeAuxiliaryState(record?.applied, parsed?.kind);
    if (!parsed || !record?.element || !original || !applied) continue;
    let byProperty = mergedAuxiliary.get(record.element);
    if (!byProperty) {
      byProperty = new Map();
      mergedAuxiliary.set(record.element, byProperty);
    }
    byProperty.set(record.property, {
      element: record.element,
      property: record.property,
      original,
      applied,
    });
  }
  for (const [element, byProperty] of incomingAuxiliary) {
    let mergedByProperty = mergedAuxiliary.get(element);
    if (!mergedByProperty) {
      mergedByProperty = new Map();
      mergedAuxiliary.set(element, mergedByProperty);
    }
    for (const [property, record] of byProperty) {
      const existing = mergedByProperty.get(property);
      mergedByProperty.set(property, {
        ...record,
        original: existing?.original || record.original,
      });
    }
  }

  const frozenAuxiliary = [...mergedAuxiliary.values()].flatMap(byProperty => (
    [...byProperty.values()].map(record => Object.freeze({
      ...record,
      sessionId,
      original: Object.freeze(cloneAuxiliaryState(record.original)),
      applied: Object.freeze(cloneAuxiliaryState(record.applied)),
    }))
  ));
  const updatedEntry = {
    ...entry,
    originalTextNodesData: Object.freeze(updatedSnapshots),
    auxiliaryOwnershipRecords: Object.freeze(frozenAuxiliary),
  };
  const updatedHistory = history.slice();
  updatedHistory[historyIndex] = updatedEntry;
  globalSelectElementState.translationHistory = updatedHistory;

  if (globalSelectElementState.currentTranslation?.sessionId === sessionId) {
    globalSelectElementState.currentTranslation = updatedEntry;
  }

  for (const record of auxiliaryRecords) {
    const parsed = parseAuxiliaryProperty(record.property);
    const mergedRecord = mergedAuxiliary.get(record.element)?.get(record.property);
    if (!parsed || !mergedRecord) continue;
    const owners = getAuxiliaryBucket(record.element, record.property, true);
    const existing = owners.find(owner => owner.sessionId === sessionId);
    if (existing) {
      existing.applied = cloneAuxiliaryState(mergedRecord.applied);
    } else {
      owners.push({
        sessionId,
        element: record.element,
        property: record.property,
        original: cloneAuxiliaryState(mergedRecord.original),
        applied: cloneAuxiliaryState(mergedRecord.applied),
      });
    }
  }

  return true;
}

/**
 * Removes one translation generation and its session-scoped rollback snapshots.
 *
 * @param {string} sessionId - Translation generation owner
 * @returns {boolean} Whether a history entry was removed
 */
export function removeSelectElementTranslation(sessionId) {
  if (!sessionId) return false;

  const history = globalSelectElementState.translationHistory;
  const remainingHistory = history.filter(entry => entry.sessionId !== sessionId);
  if (remainingHistory.length === history.length) return false;

  globalSelectElementState.translationHistory = remainingHistory;
  removeAuxiliaryOwnership(sessionId);
  compactAuxiliaryInvalidations();
  for (const key of globalSelectElementState.snapshots?.keys() || []) {
    if (key.startsWith(`${sessionId}:`)) globalSelectElementState.snapshots.delete(key);
  }
  if (globalSelectElementState.currentTranslation?.sessionId === sessionId) {
    globalSelectElementState.currentTranslation = remainingHistory.at(-1) || null;
  }
  return true;
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
  staleSessions.forEach(removeAuxiliaryOwnership);
  compactAuxiliaryInvalidations();
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
  const invalidatedNodes = new Set();

  const logRestoreFailure = (phase, error, details = {}) => {
    logger.error(`[Rollback] ${phase} failed`, { ...details, error });
  };

  try {
    synchronizeAuxiliaryOwnership();

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
      if (!element?.isConnected) {
        logger.debug('Element no longer in DOM, skipping', { tagName: element?.tagName });
        continue;
      }

      // 1. Restore content - SURGICAL RESTORATION ONLY
      let hasOwnedCurrentNode = false;
      if (originalTextNodesData && originalTextNodesData.length > 0) {
        let restoredNodes = 0;
        for (const { node, originalText, appliedText } of originalTextNodesData) {
          if (invalidatedNodes.has(node)) continue;

          // Verify the node still exists and is attached to the document
          let isAttached = false;
          try {
            isAttached = Boolean(node?.isConnected);
          } catch (error) {
            logRestoreFailure('Text attachment check', error);
            continue;
          }

          if (!isAttached) {
            invalidatedNodes.add(node);
            continue;
          }

          if (typeof appliedText !== 'string') continue;
          if (node.nodeValue !== appliedText) {
            invalidatedNodes.add(node);
            logger.debug('Skipping externally changed translated node during revert', {
              tagName: element?.tagName,
            });
            continue;
          }
          hasOwnedCurrentNode = true;

          try {
            node.nodeValue = originalText;
            restoredNodes++;
          } catch (error) {
            invalidatedNodes.add(node);
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

      // 2. Restore auxiliary state independently from text ownership.
      if (!element) continue;

      const hasAuxiliaryOwnership = Array.isArray(translation.auxiliaryOwnershipRecords)
        && translation.auxiliaryOwnershipRecords.length > 0;
      if (hasAuxiliaryOwnership) {
        restoreOwnedAuxiliaryRecords(sessionId, translation.auxiliaryOwnershipRecords, logger);
      } else if (originalTextNodesData?.length > 0 && !hasOwnedCurrentNode) {
        logger.debug('Skipping legacy auxiliary revert state after node ownership drift', {
          tagName: element?.tagName,
        });
        try {
          pageEventBus.emit('hide-translation', { element });
        } catch (error) {
          logRestoreFailure('Hide translation event', error, { tagName: element?.tagName });
        }
        continue;
      } else if (Array.isArray(translation.originalMetadataSnapshots)) {
        const restoredMetadataElements = new Set();
        for (const snapshot of translation.originalMetadataSnapshots) {
          if (!snapshot?.element || restoredMetadataElements.has(snapshot.element)) continue;
          restoredMetadataElements.add(snapshot.element);
          restoreMetadataSnapshot(snapshot, logger);
        }
      } else {
        // Legacy entries predate identity-captured metadata. Keep fallback scoped
        // to light DOM so it cannot mutate replacement shadow content.
        const attr = PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL;
        const isShadowRootElement = Boolean(element.getRootNode?.()?.host);
        if (!isShadowRootElement) {
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
        }
      }

      if (!hasAuxiliaryOwnership) {
        if (translation.shadowSpanning && Array.isArray(translation.originalDirectionSnapshots)) {
          const directionSnapshots = translation.originalDirectionSnapshots.filter(snapshot => snapshot?.element?.isConnected);
          const directionFailures = restoreNodeDirectionState(directionSnapshots) || [];
          directionFailures.forEach(failure => logRestoreFailure('Direction/style restoration', failure.error, failure));
        } else {
          try {
            restoreElementDirection(element);
          } catch (error) {
            logRestoreFailure('Direction/style restoration', error, { tagName: element.tagName });
          }
        }
      }

      try {
        pageEventBus.emit('hide-translation', { element });
      } catch (error) {
        logRestoreFailure('Hide translation event', error, { tagName: element.tagName });
      }
    }

    // Clean up registry history
    if (targetSessionId) {
      removeAuxiliaryOwnership(targetSessionId);
      globalSelectElementState.translationHistory = globalSelectElementState.translationHistory.filter(
        t => t.sessionId !== targetSessionId
      );
      compactAuxiliaryInvalidations();
      if (globalSelectElementState.snapshots) {
        // Purge session-scoped snapshots
        for (const key of globalSelectElementState.snapshots.keys()) {
          if (key.startsWith(`${targetSessionId}:`)) {
            globalSelectElementState.snapshots.delete(key);
          }
        }
      }
    } else {
      globalSelectElementState.auxiliaryOwnership?.clear();
      globalSelectElementState.auxiliaryInvalidations?.clear();
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
