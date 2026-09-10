/**
 * Data storage for pending translation data
 */
import { TranslationMode } from "@/shared/config/config.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { translationRequestTracker } from '@/core/services/translation/TranslationRequestTracker.js';
import { resourceTracker, messageSources, processedMessageIds } from './state.js';
import { MAX_AGE, MAX_PROCESSED_MESSAGE_IDS } from './constants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SmartTranslationDataStore');

// Store pending translation data - WeakMap is more resilient to cleanup
export const pendingTranslationData = new WeakMap();

// Track active AbortControllers for elements to allow cancellation of previous requests
export const activeAbortControllers = new WeakMap();

// Authoritative latest-request ownership per target element.
export const fieldRequestOwners = new WeakMap();

// Reference with toast ID as fallback
export const pendingTranslationByToastId = new Map();

/**
 * Clear compatibility state that still belongs to a superseded Field request.
 *
 * @param {Object|null} previousOwnership
 * @returns {void}
 */
export function cleanupSupersededFieldTranslationState(previousOwnership) {
  if (!previousOwnership) return;

  const { target, data, toastId } = previousOwnership;

  if (target && data && pendingTranslationData.get(target) === data) {
    pendingTranslationData.delete(target);
  }

  if (toastId && data && pendingTranslationByToastId.get(toastId) === data) {
    pendingTranslationByToastId.delete(toastId);
  }

  if (window.pendingTranslationOwner === previousOwnership) {
    window.pendingTranslationOwner = null;
    window.pendingTranslationTarget = null;
    window.pendingTranslationMode = null;
    window.pendingTranslationPlatform = null;
    window.pendingTranslationTabId = null;
    window.pendingSelectionRange = null;
    window.pendingSourceSnapshot = null;
    window.pendingSubmittedText = null;
    window.pendingTranslationTimestamp = null;
    window.pendingTranslationToastId = null;
  }
}

/**
 * Begin latest-request ownership for a target and abort its previous owner.
 * @param {HTMLElement} target
 * @returns {{ ownership: Object, previous: Object|null }} Ownership state.
 */
export function beginFieldTranslationRequest(target) {
  const previous = target ? fieldRequestOwners.get(target) || null : null;

  if (previous) {
    previous.replaced = true;
    previous.controller.abort('New request started');
  }

  const ownership = {
    target,
    controller: new AbortController(),
    replaced: false,
    data: null,
    toastId: null,
    messageId: null,
  };

  if (target) {
    fieldRequestOwners.set(target, ownership);
    activeAbortControllers.set(target, ownership.controller);
  }

  return { ownership, previous };
}

/**
 * Check whether request still owns target-scoped Field state.
 * @param {HTMLElement} target
 * @param {Object} ownership
 * @returns {boolean}
 */
export function isCurrentFieldTranslationRequest(target, ownership) {
  return Boolean(
    target
    && ownership
    && !ownership.replaced
    && fieldRequestOwners.get(target) === ownership
  );
}

/**
 * Release target ownership only when caller still owns it.
 * @param {HTMLElement} target
 * @param {Object} ownership
 * @returns {boolean}
 */
export function releaseFieldTranslationRequest(target, ownership) {
  if (!isCurrentFieldTranslationRequest(target, ownership)) return false;

  fieldRequestOwners.delete(target);
  if (activeAbortControllers.get(target) === ownership.controller) {
    activeAbortControllers.delete(target);
  }
  return true;
}

/**
 * Register an AbortController for a target element
 * @param {HTMLElement} target - The target element
 * @param {AbortController} controller - The controller to register
 */
export function registerAbortController(target, controller) {
  if (!target) return;
  const ownership = fieldRequestOwners.get(target);
  if (ownership && ownership.controller === controller && !ownership.replaced) {
    activeAbortControllers.set(target, controller);
  }
}

/**
 * Abort and remove a controller for a target element
 * @param {HTMLElement} target - The target element
 * @param {string} reason - Optional reason for aborting
 * @returns {Object|null} The data of the aborted request, if any
 */
export function abortExistingRequest(target, reason = 'New request started') {
  if (!target) return null;

  const ownership = fieldRequestOwners.get(target);
  if (ownership) {
    ownership.replaced = true;
    ownership.controller.abort(reason);
    if (fieldRequestOwners.get(target) === ownership) fieldRequestOwners.delete(target);
    if (activeAbortControllers.get(target) === ownership.controller) {
      activeAbortControllers.delete(target);
    }
    return ownership.data;
  }
  
  const controller = activeAbortControllers.get(target);
  if (controller) {
    const data = pendingTranslationData.get(target);
    if (data) {
      data.abortedForReplacement = true;
    }
    
    logger.debug('Aborting existing translation request for element', { reason });
    controller.abort(reason);
    activeAbortControllers.delete(target);
    return data;
  }
  return null;
}

/**
 * Clear pending notification data and timeout
 * @param {string} context - Context of cleanup
 */
export function clearPendingNotificationData(context = 'cleanup', ownership = null) {
  if (ownership && !isCurrentFieldTranslationRequest(ownership.target, ownership)) return;

  if (window.pendingTranslationDismissTimeout) {
    resourceTracker.clearTimer(window.pendingTranslationDismissTimeout);
    window.pendingTranslationDismissTimeout = null;
  }
  logger.debug('Pending notification data cleared', { context });
}

/**
 * Store pending translation data
 * @param {HTMLElement} target - Target element
 * @param {string} mode - Translation mode
 * @param {string} platform - Platform
 * @param {number} tabId - Tab ID
 * @param {{start:number,end:number}|null} selectionRange - Request-time selection range
 * @param {number} timestamp - Request timestamp
 * @param {string} toastId - Toast ID
 * @param {string|null} messageId - Message ID
 * @param {Object|null} ownership - Latest-request ownership
 * @param {string|null} submittedText - Actual submitted text (selection or full value); falls back to live DOM read for legacy callers
 * @param {{scope:'selection'|'full',expectedSelectedText:string|null}|null} sourceSnapshot - Request-time scope descriptor for partial replace
 */
export function storePendingTranslationData(target, mode, platform, tabId, selectionRange, timestamp, toastId, messageId = null, ownership = null, submittedText = null, sourceSnapshot = null) {
  if (ownership && !isCurrentFieldTranslationRequest(target, ownership)) return null;

  let targetId = target?.id || null;
  let targetSelector = null;

  if (target) {
    const className = typeof target.className === 'string' ? target.className : (target.getAttribute && target.getAttribute('class')) || '';
    if (className) {
      const classes = className.split(' ').filter(c => c.trim()).join('.');
      if (classes) {
        targetSelector = `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}.${classes}`;
      }
    }

    if (!targetSelector) {
      targetSelector = target.tagName.toLowerCase();
      if (target.id) targetSelector += `#${target.id}`;
      if (target.name) targetSelector += `[name="${target.name}"]`;
    }
  }

  // requestData.text must represent the actual submitted text (selection or full
  // value), not a live re-read of target.value which would lose selection scope.
  const submittedSourceText = submittedText ?? (target ? target.value || target.textContent : '');
  const requestData = {
    text: submittedSourceText,
    targetLanguage: 'fa',
    sourceLanguage: 'auto',
    mode: TranslationMode.Field,
    translationMode: TranslationMode.Field,
    elementId: targetId,
    elementSelector: targetSelector,
    elementTagName: target?.tagName,
    elementClassName: target?.className,
    toastId,
    selectionRange,
    sourceSnapshot: sourceSnapshot ?? null,
    context: 'field-translation'
  };

  if (messageId) {
    const sender = { tab: { id: tabId }, frameId: 0 };
    translationRequestTracker.createRequest({
      messageId,
      data: requestData,
      sender,
      options: {
        priority: 'high',
        elementData: { target, targetId, targetSelector }
      }
    });
    translationRequestTracker.associateWithElement(messageId, target);
  }

  const data = {
    target, mode, platform, tabId, selectionRange, timestamp, toastId, messageId, targetId, targetSelector, ownership,
    submittedText: submittedSourceText,
    sourceSnapshot: sourceSnapshot ?? null,
  };

  if (ownership) {
    ownership.data = data;
    ownership.toastId = toastId;
    ownership.messageId = messageId;
  }

  if (target) {
    pendingTranslationData.set(target, data);
  }

  if (toastId) {
    pendingTranslationByToastId.set(toastId, data);
  }

  if (messageId) {
    messageSources.set(messageId, { source: 'direct-request', timestamp, toastId });
  }

  // Fallback properties for window
  window.pendingTranslationTarget = target;
  window.pendingTranslationMode = mode;
  window.pendingTranslationPlatform = platform;
  window.pendingTranslationTabId = tabId;
  window.pendingSelectionRange = selectionRange;
  window.pendingSourceSnapshot = sourceSnapshot ?? null;
  window.pendingSubmittedText = submittedSourceText;
  window.pendingTranslationTimestamp = timestamp;
  window.pendingTranslationToastId = toastId;
  window.pendingTranslationOwner = ownership;

  logger.debug('Stored pending translation data', { targetId, targetSelector, toastId, messageId });
  
  return data;
}

/**
 * Retrieve pending translation data
 */
export function getPendingTranslationData(fallbackTarget, toastId, ownership = null) {
  if (ownership && !isCurrentFieldTranslationRequest(fallbackTarget, ownership)) return null;

  if (ownership?.data) return ownership.data;

  // 1. Try TranslationRequestTracker by toastId
  if (toastId) {
    const request = translationRequestTracker.getRequestByToastId(toastId);
    if (request) {
      return {
        target: fallbackTarget,
        mode: request.mode,
        platform: request.metadata.platform,
        tabId: request.metadata.tabId,
        selectionRange: request.metadata.selectionRange ?? request.data?.selectionRange ?? null,
        sourceSnapshot: request.data?.sourceSnapshot ?? null,
        submittedText: request.data?.text ?? request.metadata?.originalText ?? null,
        timestamp: request.timestamp,
        toastId: request.metadata.toastId,
        messageId: request.messageId,
        targetId: request.elementData?.id,
        targetSelector: request.elementData?.selector
      };
    }
  }

  // 2. Try by element
  if (fallbackTarget) {
    const messageId = translationRequestTracker.findRequestByElement(fallbackTarget);
    if (messageId) {
      const request = translationRequestTracker.getRequest(messageId);
      if (request) {
        return {
          target: fallbackTarget,
          mode: request.mode,
          platform: request.metadata.platform,
          tabId: request.metadata.tabId,
          selectionRange: request.metadata.selectionRange ?? request.data?.selectionRange ?? null,
          sourceSnapshot: request.data?.sourceSnapshot ?? null,
          submittedText: request.data?.text ?? request.metadata?.originalText ?? null,
          timestamp: request.timestamp,
          toastId: request.metadata.toastId,
          messageId: request.messageId,
          targetId: request.elementData?.id,
          targetSelector: request.elementData?.selector
        };
      }
    }
  }

  // 3. Fallback map
  if (toastId && pendingTranslationByToastId.has(toastId)) {
    return pendingTranslationByToastId.get(toastId);
  }

  // 4. WeakMap
  if (fallbackTarget && pendingTranslationData.has(fallbackTarget)) {
    return pendingTranslationData.get(fallbackTarget);
  }

  // 5. Window properties
  if (window.pendingTranslationTarget) {
    return {
      target: window.pendingTranslationTarget,
      mode: window.pendingTranslationMode,
      platform: window.pendingTranslationPlatform,
      tabId: window.pendingTranslationTabId,
      selectionRange: window.pendingSelectionRange,
      sourceSnapshot: window.pendingSourceSnapshot ?? null,
      submittedText: window.pendingSubmittedText ?? null,
      timestamp: window.pendingTranslationTimestamp,
      toastId: window.pendingTranslationToastId
    };
  }

  return null;
}

/**
 * Clear pending translation data
 */
export function clearPendingTranslationData(specificToastId, ownership = null) {
  if (ownership && !isCurrentFieldTranslationRequest(ownership.target, ownership)) return;

  if (ownership?.target && ownership.data
    && pendingTranslationData.get(ownership.target) === ownership.data) {
    pendingTranslationData.delete(ownership.target);
  }

  if (!ownership || window.pendingTranslationOwner === ownership) {
    window.pendingTranslationOwner = null;
  }

  window.pendingTranslationTarget = null;
  window.pendingTranslationMode = null;
  window.pendingTranslationPlatform = null;
  window.pendingTranslationTabId = null;
  window.pendingSelectionRange = null;
  window.pendingSourceSnapshot = null;
  window.pendingSubmittedText = null;
  window.pendingTranslationTimestamp = null;
  window.pendingTranslationToastId = null;

  if (specificToastId) {
    const data = pendingTranslationByToastId.get(specificToastId);
    if (data && (!ownership || data.ownership === ownership) && !data.processed) {
      pendingTranslationByToastId.delete(specificToastId);
    }
  } else {
    for (const [toastId, data] of pendingTranslationByToastId.entries()) {
      if (!data.processed) {
        pendingTranslationByToastId.delete(toastId);
      }
    }
  }

  const now = Date.now();
  for (const [toastId, data] of pendingTranslationByToastId.entries()) {
    if (data.processed && now - data.timestamp > MAX_AGE) {
      pendingTranslationByToastId.delete(toastId);
    }
  }

  if (processedMessageIds.size > MAX_PROCESSED_MESSAGE_IDS) {
    const idsToArray = Array.from(processedMessageIds);
    const idsToDelete = idsToArray.slice(0, idsToArray.length - MAX_PROCESSED_MESSAGE_IDS);
    idsToDelete.forEach(id => processedMessageIds.delete(id));
  }
}
