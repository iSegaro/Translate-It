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

// Reference with toast ID as fallback
export const pendingTranslationByToastId = new Map();

/**
 * Clear pending notification data and timeout
 * @param {string} context - Context of cleanup
 */
export function clearPendingNotificationData(context = 'cleanup') {
  if (window.pendingTranslationDismissTimeout) {
    resourceTracker.clearTimer(window.pendingTranslationDismissTimeout);
    window.pendingTranslationDismissTimeout = null;
  }
  logger.debug('Pending notification data cleared', { context });
}

/**
 * Store pending translation data
 */
export function storePendingTranslationData(target, mode, platform, tabId, selectionRange, timestamp, toastId, messageId = null) {
  let targetId = target?.id || null;
  let targetSelector = null;

  if (target) {
    if (target.className) {
      const classes = target.className.split(' ').filter(c => c.trim()).join('.');
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

  const requestData = {
    text: target ? target.value || target.textContent : '',
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
    target, mode, platform, tabId, selectionRange, timestamp, toastId, messageId, targetId, targetSelector
  };

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
  window.pendingTranslationTimestamp = timestamp;
  window.pendingTranslationToastId = toastId;

  logger.debug('Stored pending translation data', { targetId, targetSelector, toastId, messageId });
}

/**
 * Retrieve pending translation data
 */
export function getPendingTranslationData(fallbackTarget, toastId) {
  // 1. Try TranslationRequestTracker by toastId
  if (toastId) {
    const request = translationRequestTracker.getRequestByToastId(toastId);
    if (request) {
      return {
        target: fallbackTarget,
        mode: request.mode,
        platform: request.metadata.platform,
        tabId: request.metadata.tabId,
        selectionRange: request.metadata.selectionRange,
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
          selectionRange: request.metadata.selectionRange,
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
      timestamp: window.pendingTranslationTimestamp,
      toastId: window.pendingTranslationToastId
    };
  }

  return null;
}

/**
 * Clear pending translation data
 */
export function clearPendingTranslationData(specificToastId) {
  window.pendingTranslationTarget = null;
  window.pendingTranslationMode = null;
  window.pendingTranslationPlatform = null;
  window.pendingTranslationTabId = null;
  window.pendingSelectionRange = null;
  window.pendingTranslationTimestamp = null;
  window.pendingTranslationToastId = null;

  if (specificToastId) {
    const data = pendingTranslationByToastId.get(specificToastId);
    if (data && !data.processed) {
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
