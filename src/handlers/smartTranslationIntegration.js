import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { pageEventBus } from "../core/PageEventBus.js";
import { MessageFormat, MessagingContexts } from "@/shared/messaging/core/MessagingCore.js";
import ExtensionContextManager from "../core/extensionContext.js";
import { TranslationMode, getREPLACE_SPECIAL_SITESAsync, getCOPY_REPLACEAsync, getTranslationApiAsync, getSourceLanguageAsync, getTargetLanguageAsync } from "@/shared/config/config.js";
import { detectPlatform, Platform } from "../utils/browser/platform.js";
import { getTranslationString } from "../utils/i18n/i18n.js";
import { getScopedLogger } from "../shared/logging/logger.js";
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { isComplexEditor } from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { translationRequestTracker } from '@/core/services/translation/TranslationRequestTracker.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SmartTranslation');

// Create a global resource tracker for this module
const resourceTracker = new ResourceTracker('smart-translation-integration');

// Use WeakMap to store pending translation data - more resilient to cleanup
const pendingTranslationData = new WeakMap();

// Also store a reference with the toast ID as fallback
const pendingTranslationByToastId = new Map();

// Track message IDs to prevent duplicate processing
const processedMessageIds = new Set();

// Track message sources to prevent duplicate processing
const messageSources = new Map(); // messageId -> source info

// Track successfully completed toast IDs to prevent any post-processing
const successfullyCompletedToastIds = new Set();

// Track active processing by messageId to prevent race conditions
const activeProcessing = new Map();

// Queue mechanism removed - processing translations directly

// Helper function to process translations directly without queue

// Helper function to clear pending notification data and timeout
function clearPendingNotificationData(context = 'cleanup') {
  // Clear timeout if it exists
  if (window.pendingTranslationDismissTimeout) {
    resourceTracker.clearTimer(window.pendingTranslationDismissTimeout);
    window.pendingTranslationDismissTimeout = null;
  }

  logger.debug('Pending notification data cleared', { context });
}

// Helper function to clean up old data to prevent memory leaks
function cleanupOldData() {
  const now = Date.now();
  const MAX_AGE = 5 * 60 * 1000; // 5 minutes

  // Clean up old message sources
  for (const [messageId, sourceInfo] of messageSources.entries()) {
    if (now - sourceInfo.timestamp > MAX_AGE) {
      messageSources.delete(messageId);
    }
  }

  // Clean up old processed message IDs
  if (processedMessageIds.size > 1000) {
    // Keep only recent ones
    const recentIds = Array.from(processedMessageIds).slice(-500);
    processedMessageIds.clear();
    recentIds.forEach(id => processedMessageIds.add(id));
  }

  // Clean up old completed toast IDs
  if (successfullyCompletedToastIds.size > 100) {
    const recentIds = Array.from(successfullyCompletedToastIds).slice(-50);
    successfullyCompletedToastIds.clear();
    recentIds.forEach(id => successfullyCompletedToastIds.add(id));
  }

  logger.debug('Cleaned up old data', {
    messageSources: messageSources.size,
    processedIds: processedMessageIds.size,
    completedToasts: successfullyCompletedToastIds.size
  });
}

// Schedule periodic cleanup
setInterval(cleanupOldData, 60000); // Clean up every minute

// Helper function to store pending translation data
function storePendingTranslationData(target, mode, platform, tabId, selectionRange, timestamp, toastId, messageId = null) {
  // Store recovery information for the target element
  let targetId = null;
  let targetSelector = null;

  if (target) {
    // Store element ID if available
    if (target.id) {
      targetId = target.id;
    }

    // Store a unique selector for recovery
    if (target.className) {
      const classes = target.className.split(' ').filter(c => c.trim()).join('.');
      if (classes) {
        targetSelector = `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}.${classes}`;
      }
    }

    // Fallback selector
    if (!targetSelector) {
      targetSelector = target.tagName.toLowerCase();
      if (target.id) targetSelector += `#${target.id}`;
      if (target.name) targetSelector += `[name="${target.name}"]`;
    }
  }

  // Create request data for TranslationRequestTracker
  const requestData = {
    text: target ? target.value || target.textContent : '',
    targetLanguage: 'fa', // Will be updated by the translation engine
    sourceLanguage: 'auto', // Will be updated by the translation engine
    mode: TranslationMode.Field,
    translationMode: TranslationMode.Field,
    elementId: targetId,
    elementSelector: targetSelector,
    elementTagName: target?.tagName,
    elementClassName: target?.className,
    toastId: toastId,
    selectionRange: selectionRange,
    context: 'field-translation'
  };

  // Create and track request using TranslationRequestTracker
  if (messageId) {
    // Create sender object for the request
    const sender = {
      tab: { id: tabId },
      frameId: 0 // Assuming main frame
    };

    const request = translationRequestTracker.createRequest({
      messageId,
      data: requestData,
      sender,
      options: {
        priority: 'high',
        elementData: {
          target,
          targetId,
          targetSelector
        }
      }
    });

    // Associate request with DOM element
    translationRequestTracker.associateWithElement(messageId, target);

    logger.debug('Created and tracked request with TranslationRequestTracker', {
      messageId,
      mode: request.mode,
      targetId,
      targetSelector
    });
  }

  // Store in WeakMap using the target element as key (backward compatibility)
  const data = {
    target,
    mode,
    platform,
    tabId,
    selectionRange,
    timestamp,
    toastId,
    messageId,
    targetId,
    targetSelector
  };

  pendingTranslationData.set(target, data);

  // Also store by toast ID for more reliable retrieval
  if (toastId) {
    // Check if we already have pending data for this toast ID
    if (pendingTranslationByToastId.has(toastId)) {
      logger.debug('Toast ID already exists in pending data, replacing');
    }
    pendingTranslationByToastId.set(toastId, data);
  }

  // Track message source to detect duplicates
  if (messageId) {
    messageSources.set(messageId, {
      source: 'direct-request',
      timestamp,
      toastId
    });
  }

  // Also store on window as fallback for compatibility
  window.pendingTranslationTarget = target;
  window.pendingTranslationMode = mode;
  window.pendingTranslationPlatform = platform;
  window.pendingTranslationTabId = tabId;
  window.pendingSelectionRange = selectionRange;
  window.pendingTranslationTimestamp = timestamp;
  window.pendingTranslationToastId = toastId;

  logger.debug('Stored pending translation data with recovery info', {
    targetId,
    targetSelector,
    toastId,
    messageId
  });
}

// Helper function to retrieve pending translation data
function getPendingTranslationData(fallbackTarget, toastId) {
  logger.debug('getPendingTranslationData called', {
    hasFallbackTarget: !!fallbackTarget,
    fallbackTargetTag: fallbackTarget?.tagName,
    weakMapHasTarget: fallbackTarget ? pendingTranslationData.has(fallbackTarget) : false,
    hasWindowTarget: !!window.pendingTranslationTarget,
    windowTargetTag: window.pendingTranslationTarget?.tagName,
    toastId: toastId,
    hasToastIdData: toastId ? pendingTranslationByToastId.has(toastId) : false
  });

  // First try to get by toast ID using TranslationRequestTracker
  if (toastId) {
    const request = translationRequestTracker.getRequestByToastId(toastId);
    if (request) {
      const data = {
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
      logger.debug('Retrieved data by toast ID from TranslationRequestTracker', {
        targetTag: data.target?.tagName,
        mode: data.mode,
        hasData: !!data
      });
      return data;
    }
  }

  // Try to find request by DOM element
  if (fallbackTarget) {
    const messageId = translationRequestTracker.findRequestByElement(fallbackTarget);
    if (messageId) {
      const request = translationRequestTracker.getRequest(messageId);
      if (request) {
        const data = {
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
        logger.debug('Retrieved data by element from TranslationRequestTracker', {
          targetTag: data.target?.tagName,
          mode: data.mode,
          hasData: !!data
        });
        return data;
      }
    }
  }

  // Fallback to existing toast ID map
  if (toastId && pendingTranslationByToastId.has(toastId)) {
    const data = pendingTranslationByToastId.get(toastId);
    logger.debug('Retrieved data by toast ID from fallback map', {
      targetTag: data.target?.tagName,
      mode: data.mode,
      hasData: !!data
    });
    return data;
  }

  // Try to get from WeakMap
  if (fallbackTarget && pendingTranslationData.has(fallbackTarget)) {
    const data = pendingTranslationData.get(fallbackTarget);
    logger.debug('Retrieved data from WeakMap', {
      targetTag: data.target?.tagName,
      mode: data.mode,
      hasData: !!data
    });
    return data;
  }

  // Fallback to window properties
  if (window.pendingTranslationTarget) {
    const data = {
      target: window.pendingTranslationTarget,
      mode: window.pendingTranslationMode,
      platform: window.pendingTranslationPlatform,
      tabId: window.pendingTranslationTabId,
      selectionRange: window.pendingSelectionRange,
      timestamp: window.pendingTranslationTimestamp,
      toastId: window.pendingTranslationToastId
    };
    logger.debug('Retrieved data from window properties', {
      targetTag: data.target?.tagName,
      mode: data.mode,
      hasData: !!data
    });
    return data;
  }

  logger.debug('No pending translation data found');
  return null;
}

export async function translateFieldViaSmartHandler({ text, target, selectionRange = null, tabId, toastId }) {
  logger.info('Translation field request', { textLength: text?.length, targetTag: target?.tagName, mode: selectionRange ? 'SelectElement' : 'Field' });
  
  if (!text) {
    logger.warn('No text provided for translation');
    return;
  }
  
  // Check extension context before proceeding
  if (!ExtensionContextManager.isValidSync()) {
    const contextError = new Error('Extension context invalidated');
    ExtensionContextManager.handleContextError(contextError, 'text-field-translation');
    return;
  }

  const mode = 'field';
  const platform = detectPlatform(target);
  const timestamp = Date.now();

  try {
    // Get current settings from storage
    const currentProvider = await getTranslationApiAsync();
    const currentSourceLang = await getSourceLanguageAsync();
    const currentTargetLang = await getTargetLanguageAsync();

    logger.debug('Retrieved current settings for translation', {
      provider: currentProvider,
      source: currentSourceLang,
      target: currentTargetLang
    });

    const newToastId = `status-${Date.now()}`;

    // Generate a unique message ID for this request
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store target element for later use when translation result arrives
    storePendingTranslationData(target, mode, platform, tabId, selectionRange, timestamp, newToastId, messageId);

    logger.debug('Stored pending translation data', {
      target: target?.tagName,
      mode,
      platform,
      timestamp
    });
    // Store the toast ID globally for cleanup in case of errors
    window.pendingTranslationToastId = newToastId;
    const translatingMessage = await getTranslationString('SELECT_ELEMENT_TRANSLATING') || 'Translating...';
    pageEventBus.emit('show-notification', { id: newToastId, message: translatingMessage, type: 'status' });

    // Set a timeout to automatically dismiss the notification if no response is received
    // This prevents the "Translating..." message from staying stuck forever
    logger.debug('Setting up translation timeout (15 seconds)');
    window.pendingTranslationDismissTimeout = resourceTracker.trackTimeout(() => {
      logger.debug('Translation request timeout reached, dismissing notification');
      if (window.pendingTranslationToastId) {
        pageEventBus.emit('dismiss_notification', { id: window.pendingTranslationToastId });
        window.pendingTranslationToastId = null;
      }
      clearPendingNotificationData('translation-timeout');
    }, 15000); // 15 seconds timeout

    // Send direct translation message to background (fire-and-forget pattern like element selection)
    // Response will come via TRANSLATION_RESULT_UPDATE broadcast and handled by ContentMessageHandler
    const translationMessage = MessageFormat.create(
      MessageActions.TRANSLATE,
      {
        text: text,
        provider: currentProvider,
        sourceLanguage: currentSourceLang || 'auto',
        targetLanguage: currentTargetLang || 'fa',
        mode: mode,
        options: {
          toastId: newToastId,
          messageId: messageId,
          isDirectRequest: true
        }
      },
      MessagingContexts.CONTENT,
      { messageId } // Pass our custom messageId
    );
    
    // Use ExtensionContextManager for safe message sending
    const messageResult = await ExtensionContextManager.safeSendMessage(translationMessage, 'text-field-translation');

    if (messageResult === null) {
      // Extension context is invalid, dismiss the notification and handle silently
      logger.debug('Translation request failed - extension context invalid, dismissing notification');
      pageEventBus.emit('dismiss_notification', { id: newToastId });
      clearPendingNotificationData('translateFieldViaSmartHandler-context-invalid');
      ExtensionContextManager.handleContextError('Extension context invalid', 'text-field-translation-request');
      return;
    }

    logger.debug('Translation request sent, waiting for response');

    // For field mode, wait for the direct response
    try {
      if (messageResult && messageResult.success) {
        logger.debug('Received translation result directly, applying to field');

        // Clear the timeout since we got a response
        if (window.pendingTranslationDismissTimeout) {
          resourceTracker.clearTimer(window.pendingTranslationDismissTimeout);
          window.pendingTranslationDismissTimeout = null;
        }

        // Apply the translation directly
        const result = await applyTranslationToTextField(
          messageResult.translatedText,
          messageResult.originalText,
          messageResult.mode || TranslationMode.Field,
          newToastId,
          messageId
        );

        logger.debug('Field translation applied', { result });
        return;
      } else if (messageResult && messageResult.success === false) {
        // Handle error response
        logger.debug('Translation failed', { error: messageResult.error });

        // Dismiss notification on error
        pageEventBus.emit('dismiss_notification', { id: newToastId });
        clearPendingNotificationData('translateFieldViaSmartHandler-error');

        // Show error message if available
        if (messageResult.error) {
          const handler = ErrorHandler.getInstance();
          await handler.handle(new Error(messageResult.error), {
            type: ErrorTypes.TRANSLATION_FAILED,
            context: 'text-field-response',
            showToast: true
          });
        }
        return;
      }
    } catch (responseError) {
      logger.error('Error handling translation response', responseError);

      // Dismiss notification on error
      pageEventBus.emit('dismiss_notification', { id: newToastId });
      clearPendingNotificationData('translateFieldViaSmartHandler-response-error');
    }
    
  } catch (err) {
    const handler = ErrorHandler.getInstance();
    await handler.handle(err, {
      type: ErrorTypes.TRANSLATION_FAILED,
      context: 'text-field-request',
      showToast: true
    });

    // Dismiss notification on error
    if (toastId) {
      pageEventBus.emit('dismiss_notification', { id: toastId });
    }
    // Also clear the globally stored toast ID
    if (window.pendingTranslationToastId) {
      pageEventBus.emit('dismiss_notification', { id: window.pendingTranslationToastId });
      window.pendingTranslationToastId = null;
    }
    // Clear the timeout on error too
    if (window.pendingTranslationDismissTimeout) {
      resourceTracker.clearTimer(window.pendingTranslationDismissTimeout);
      window.pendingTranslationDismissTimeout = null;
    }
    clearPendingNotificationData('translateFieldViaSmartHandler-error');
  }
}

/**
 * Process translation result to active text field (internal implementation)
 * This function processes the actual translation after queue management
 * @param {string} translatedText - The translated text
 * @param {string} originalText - The original text
 * @param {string} translationMode - Translation mode
 * @param {string} toastId - Toast ID for tracking
 * @param {string} messageId - Message ID for duplicate detection
 * @returns {Promise<Object>} Application result
 */
async function processTranslationToTextField(translatedText, originalText, translationMode, toastId, messageId) {
  logger.info('Applying translation to text field', {
    translatedLength: translatedText?.length,
    originalLength: originalText?.length,
    translationMode,
    hasToastId: !!toastId,
    toastId,
    messageId
  });

  // Check if we've already processed this message ID
  if (messageId && processedMessageIds.has(messageId)) {
    logger.debug('Message ID already processed, skipping', { messageId });
    return { applied: false, mode: 'message-id-already-processed' };
  }

  // Check if this message is currently being processed (simple lock)
  if (messageId && activeProcessing.has(messageId)) {
    logger.debug('Message ID is already being processed, skipping duplicate', { messageId });
    return { applied: false, mode: 'already-processing' };
  }

  // Mark this message as being processed
  if (messageId) {
    activeProcessing.set(messageId, true);
    logger.debug('Marked message ID as actively processing', { messageId });
  }

  // Small delay to ensure pending data is stored (for field mode)
  if (!toastId && translationMode === 'field') {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Check if we've already processed this translation
  logger.debug('Checking for existing translation data', { toastId, hasToastId: !!toastId });

  if (toastId && pendingTranslationByToastId.has(toastId)) {
    const pendingData = pendingTranslationByToastId.get(toastId);
    logger.debug('Found existing translation data', {
      toastId,
      processed: pendingData.processed,
      processing: pendingData.processing,
      processedAt: pendingData.processedAt,
      processingStarted: pendingData.processingStarted
    });

    if (pendingData.processed) {
      logger.debug('Translation already processed, skipping', {
        toastId,
        processedAt: pendingData.processedAt,
        text: translatedText?.substring(0, 50)
      });
      return { applied: false, mode: 'already-processed' };
    }

    // Mark as being processed to prevent race conditions
    if (pendingData.processing) {
      logger.debug('Translation already being processed, skipping', {
        toastId,
        processingStarted: pendingData.processingStarted
      });
      return { applied: false, mode: 'already-processing' };
    }
    pendingData.processing = true;
    pendingData.processingStarted = Date.now();
    pendingTranslationByToastId.set(toastId, pendingData);
    logger.debug('Marked translation as processing', { toastId });
  } else if (toastId) {
    logger.debug('No existing data found for toastId', { toastId });
  }
  
  // Debug: Log the actual texts for verification
  logger.debug('Translation details:', {
    originalText: originalText?.substring(0, 100) + (originalText?.length > 100 ? '...' : ''),
    translatedText: translatedText?.substring(0, 100) + (translatedText?.length > 100 ? '...' : '')
  });
  
  // Check if translation was successful
  if (!translatedText || translatedText === 'undefined' || translatedText.trim() === '') {
    const errorMessage = 'Translation failed or returned empty result';
    logger.error(errorMessage, { translatedText, originalText });

    // Dismiss the status notification if it exists
    if (toastId) {
      pageEventBus.emit('dismiss_notification', { id: toastId });
    }
    clearPendingNotificationData('applyTranslationToTextField-failed');

    // Also dismiss any pending notifications that might be stuck
    if (window.pendingTranslationToastId) {
      pageEventBus.emit('dismiss_notification', { id: window.pendingTranslationToastId });
      window.pendingTranslationToastId = null;
    }

    // Use centralized error handling
    const errorHandler = ErrorHandler.getInstance();
    await errorHandler.handle(new Error(errorMessage), {
      context: 'text-field-empty-result',
      type: ErrorTypes.TRANSLATION_FAILED,
      showToast: true
    });

    // Clear pending translation data
    clearPendingTranslationData(toastId);
    throw new Error(errorMessage);
  }
  
  try {
    // Check if pending data is stale (older than 30 seconds)
    const STALE_DATA_THRESHOLD = 30000; // 30 seconds
    const currentTime = Date.now();
    const pendingTimestamp = window.pendingTranslationTimestamp;
    
    const isStaleData = pendingTimestamp && (currentTime - pendingTimestamp) > STALE_DATA_THRESHOLD;
    
    if (isStaleData) {
      logger.warn('Pending translation data is stale, clearing', {
        age: currentTime - pendingTimestamp,
        threshold: STALE_DATA_THRESHOLD
      });
      clearPendingTranslationData(toastId);

      // Clear the active processing lock for stale data
      if (messageId) {
        activeProcessing.delete(messageId);
        logger.debug('Cleared processing lock due to stale data', { messageId });
      }
    }

    // Get pending translation data using the robust retrieval method
    const pendingData = getPendingTranslationData(document.activeElement, toastId);

    // Use retrieved data or fallback to active element
    let target = pendingData?.target || document.activeElement;
    const mode = pendingData?.mode || translationMode;
    const platform = pendingData?.platform || detectPlatform(target);
    const selectionRange = pendingData?.selectionRange || null;
    const tabId = pendingData?.tabId || null;

    logger.debug('Target element info', {
      hasPendingData: !!pendingData,
      hasPendingTarget: !!window.pendingTranslationTarget,
      activeElement: document.activeElement?.tagName,
      targetElement: target?.tagName,
      targetIsEditable: isEditableElement(target),
      translationMode: mode,
      isStaleData,
      pendingAge: pendingTimestamp ? currentTime - pendingTimestamp : 'N/A'
    });
    
    // Dismiss the status notification if it exists
    if (toastId) {
      pageEventBus.emit('dismiss_notification', { id: toastId });
    }
    clearPendingNotificationData('applyTranslationToTextField-success');
    
    // For dictionary mode (text selection), we don't need an editable target
    const isDictionaryMode = mode === TranslationMode.Dictionary_Translation || mode === 'dictionary';
    const isSelectElementMode = mode === TranslationMode.Select_Element || mode === 'select_element';

    if (!isDictionaryMode && (!target || !isEditableElement(target))) {
      logger.warn('Invalid target for non-dictionary mode', {
        mode,
        isDictionaryMode,
        isSelectElementMode,
        hasTarget: !!target,
        targetTag: target?.tagName,
        isEditable: isEditableElement(target)
      });

      // Try element recovery strategies
      let recoveredTarget = null;

      // Strategy 1: Try active element
      const activeElement = document.activeElement;
      if (activeElement && isEditableElement(activeElement)) {
        logger.debug('Using active element as fallback target');
        recoveredTarget = activeElement;
      }

      // Strategy 2: Try to find by element ID if stored
      if (!recoveredTarget && pendingData?.targetId) {
        const elementById = document.getElementById(pendingData.targetId);
        if (elementById && isEditableElement(elementById)) {
          logger.debug('Recovered target by element ID');
          recoveredTarget = elementById;
        }
      }

      // Strategy 3: Try to find by selector if stored
      if (!recoveredTarget && pendingData?.targetSelector) {
        const elements = document.querySelectorAll(pendingData.targetSelector);
        for (const elem of elements) {
          if (isEditableElement(elem)) {
            logger.debug('Recovered target by selector');
            recoveredTarget = elem;
            break;
          }
        }
      }

      // Strategy 4: Try all editable elements (last resort)
      if (!recoveredTarget) {
        const editableElements = document.querySelectorAll('input, textarea, [contenteditable="true"]');
        if (editableElements.length === 1) {
          logger.debug('Using single editable element as fallback');
          recoveredTarget = editableElements[0];
        }
      }

      if (recoveredTarget) {
        target = recoveredTarget;
        // Update stored data with recovered target
        if (pendingData) {
          pendingData.target = target;
          pendingTranslationByToastId.set(toastId, pendingData);
        }
      } else {
        throw new Error('No valid target element found');
      }
    }
    
    // For dictionary mode, we can proceed without editable target (copy mode)
    if (isDictionaryMode && (!target || !isEditableElement(target))) {
      logger.debug('Dictionary mode with non-editable target - using copy mode');
    }
    
    // For dictionary mode, we usually just display in tooltip/popup, not replace text
    if (isDictionaryMode) {
      logger.debug('Dictionary mode translation completed');
      clearPendingTranslationData(toastId);
      return { applied: true, mode: 'dictionary' };
    }
    
    const isReplaceMode = await determineReplaceMode(mode, platform);
    logger.debug('Replace mode determined', { isReplaceMode, mode, platform });
    
    if (isReplaceMode && target && isEditableElement(target)) {
      logger.debug('Calling applyTranslation');
      const wasApplied = await applyTranslation(translatedText, selectionRange, platform, tabId, target, toastId);
      logger.debug('applyTranslation completed', { success: wasApplied });
      
      // Mark as processed but don't clear - we need to remember it was processed
      if (wasApplied && toastId && pendingTranslationByToastId.has(toastId)) {
        const data = pendingTranslationByToastId.get(toastId);
        data.processed = true;
        data.applied = true;
        data.processedAt = Date.now();
        data.processing = false;
        pendingTranslationByToastId.set(toastId, data);
        logger.debug('Marked translation as processed and applied', {
          toastId,
          processingTime: data.processedAt - data.processingStarted
        });

        // Mark this toast ID as successfully completed to prevent any post-processing
        successfullyCompletedToastIds.add(toastId);

        // Clean up old completed toast IDs to prevent memory growth (keep last 100)
        if (successfullyCompletedToastIds.size > 100) {
          const oldest = successfullyCompletedToastIds.values().next().value;
          successfullyCompletedToastIds.delete(oldest);
          logger.debug('Cleaned up oldest completed toast ID', { oldest });
        }
      }

      // Clear the active processing lock
      if (messageId) {
        activeProcessing.delete(messageId);
        processedMessageIds.add(messageId);
        logger.debug('Cleared processing lock and marked as processed', { messageId });
      }
      
      return { applied: wasApplied, mode: 'replace' };
    } else {
      logger.debug('Copy mode - copying to clipboard');
      await (async function copyToClipboard(text) {
        try {
          await navigator.clipboard.writeText(text);
          const successMessage = await getTranslationString("STATUS_SMARTTRANSLATE_COPIED") || "متن ترجمه شده در حافظه کپی شد";
          pageEventBus.emit('show-notification', { message: successMessage, type: "success" });
        } catch (error) {
          const errorMessage = await getTranslationString("STATUS_SMART_TRANSLATE_COPY_ERROR") || "خطا در کپی کردن متن";
          pageEventBus.emit('show-notification', { message: errorMessage, type: "error" });
          const { sendMessage } = await import('@/shared/messaging/core/UnifiedMessaging.js');
          await sendMessage({ action: MessageActions.HANDLE_ERROR, data: { error, context: 'smartTranslation-clipboard' } }).catch(()=>{});
        }
      })(translatedText);
      
      // Clear pending data after copy operation
      clearPendingTranslationData(toastId);

      // Clear the active processing lock
      if (messageId) {
        activeProcessing.delete(messageId);
        processedMessageIds.add(messageId);
        logger.debug('Cleared processing lock after copy operation', { messageId });
      }

      return { applied: true, mode: 'copy' };
    }
    
  } catch (error) {
    logger.error('Error in applyTranslationToTextField', error);

    // Clear processing flag on error
    if (toastId && pendingTranslationByToastId.has(toastId)) {
      const data = pendingTranslationByToastId.get(toastId);
      data.processing = false;
      pendingTranslationByToastId.set(toastId, data);
    }

    // Use centralized error handling
    const errorHandler = ErrorHandler.getInstance();
    await errorHandler.handle(error, {
      context: 'text-field-application',
      type: ErrorTypes.TRANSLATION_FAILED,
      showToast: true
    });

    // Clear pending data on error as well
    clearPendingTranslationData(toastId);

    // Clear the active processing lock on error
    if (messageId) {
      activeProcessing.delete(messageId);
      // Don't mark as processed on error - allow retries
      logger.debug('Cleared processing lock due to error', { messageId });
    }

    throw error;
  }
}

/**
 * Apply translation result to active text field (public API)
 * This function is called when TRANSLATION_RESULT_UPDATE message is received
 * Uses a queue to ensure sequential processing and prevent race conditions
 * @param {string} translatedText - The translated text
 * @param {string} originalText - The original text
 * @param {string} translationMode - Translation mode
 * @param {string} toastId - Toast ID for tracking
 * @param {string} messageId - Message ID for duplicate detection
 * @returns {Promise<Object>} Application result
 */
export async function applyTranslationToTextField(translatedText, originalText, translationMode, toastId, messageId) {
  logger.info('Applying translation to text field', {
    translatedLength: translatedText?.length,
    originalLength: originalText?.length,
    translationMode,
    hasToastId: !!toastId,
    toastId,
    messageId
  });

  try {
    // Check if we've already completed this translation successfully
    if (toastId && successfullyCompletedToastIds.has(toastId)) {
      logger.debug('Toast ID already successfully completed, skipping', { toastId });
      return { applied: false, mode: 'already-completed' };
    }

    // Check if we're already processing this message ID to prevent race conditions
    if (messageId && activeProcessing.has(messageId)) {
      logger.debug('Message ID already being processed, waiting...', { messageId });
      // Wait for the active processing to complete
      const activeRequest = activeProcessing.get(messageId);
      if (activeRequest && activeRequest.promise) {
        return await activeRequest.promise;
      }
      return { applied: false, mode: 'already-processing' };
    }

    // Mark as being processed to prevent duplicates
    let processingPromise;
    if (messageId) {
      processingPromise = (async () => {
        try {
          const result = await processTranslationToTextField(translatedText, originalText, translationMode, toastId, messageId);
          // Only mark as processed after successful completion
          processedMessageIds.add(messageId);
          return result;
        } finally {
          // Clear active processing lock
          activeProcessing.delete(messageId);
        }
      })();

      // Store the promise so other calls can wait for it
      activeProcessing.set(messageId, { promise: processingPromise });

      return await processingPromise;
    } else {
      // No messageId, process directly
      const result = await processTranslationToTextField(translatedText, originalText, translationMode, toastId, messageId);
      return result;
    }

  } catch (error) {
    logger.error('Error in applyTranslationToTextField', error);
    // Clear active processing lock on error
    if (messageId) {
      activeProcessing.delete(messageId);
    }
    return { applied: false, mode: 'error', error: error.message };
  }
}

/**
 * Clear pending translation data
 * @param {string} specificToastId - Optional toast ID to clear only specific entry
 */
function clearPendingTranslationData(specificToastId) {
  // Clear window properties
  window.pendingTranslationTarget = null;
  window.pendingTranslationMode = null;
  window.pendingTranslationPlatform = null;
  window.pendingTranslationTabId = null;
  window.pendingSelectionRange = null;
  window.pendingTranslationTimestamp = null;
  window.pendingTranslationToastId = null;

  // Only clear unprocessed entries from the toast ID map
  if (specificToastId) {
    const data = pendingTranslationByToastId.get(specificToastId);
    if (data && !data.processed) {
      pendingTranslationByToastId.delete(specificToastId);
    }
  } else {
    // Clear only unprocessed entries
    for (const [toastId, data] of pendingTranslationByToastId.entries()) {
      if (!data.processed) {
        pendingTranslationByToastId.delete(toastId);
      }
    }
  }

  // Clean up old processed entries (older than 5 minutes)
  const now = Date.now();
  for (const [toastId, data] of pendingTranslationByToastId.entries()) {
    if (data.processed && now - data.timestamp > 300000) {
      pendingTranslationByToastId.delete(toastId);
      logger.debug('Cleaned up old processed translation entry', { toastId, age: now - data.timestamp });
    }
  }

  // Clean up old message IDs - keep only the most recent 1000
  if (processedMessageIds.size > 1000) {
    const idsToArray = Array.from(processedMessageIds);
    const idsToDelete = idsToArray.slice(0, idsToArray.length - 1000);
    for (const id of idsToDelete) {
      processedMessageIds.delete(id);
    }
    logger.debug('Cleaned up old message IDs', {
      deletedCount: idsToDelete.length,
      remainingCount: processedMessageIds.size
    });
  }

  // Note: WeakMap entries are automatically cleared when the target element is garbage collected
  // No need to manually clear WeakMap entries
}

/**
 * Check if element is editable
 * @param {Element} element - Element to check
 * @returns {boolean} Whether element is editable
 */
function isEditableElement(element) {
  if (!element) return false;
  
  return (
    element.isContentEditable ||
    ["INPUT", "TEXTAREA"].includes(element.tagName) ||
    (element.closest && element.closest('[contenteditable="true"]'))
  );
}

async function determineReplaceMode(mode, platform) {
  logger.debug('Determining replace mode', { mode, platform });

  // For Select Element mode, always replace
  if (mode === TranslationMode.Select_Element || mode === 'select_element') {
    logger.debug('SelectElement mode detected, using replace mode');
    return true;
  }

  // Check for special sites first - this takes precedence over COPY_REPLACE setting
  if (platform !== Platform.Default) {
    const replaceSpecial = await getREPLACE_SPECIAL_SITESAsync();
    logger.debug('Special platform detected', { platform, replaceSpecial });
    // If REPLACE_SPECIAL_SITES is true, always replace regardless of COPY_REPLACE
    if (replaceSpecial) {
      logger.debug('REPLACE_SPECIAL_SITES enabled - forcing replace mode on special platform');
      return true;
    }
  }

  // For Field mode, check the COPY_REPLACE setting
  if (mode === TranslationMode.Field || mode === 'field') {
    logger.debug('Field mode detected, checking COPY_REPLACE setting');
    const isCopy = await getCOPY_REPLACEAsync();
    logger.debug('COPY_REPLACE setting for Field mode', { setting: isCopy });

    // If COPY_REPLACE is "copy", then copy to clipboard
    // If COPY_REPLACE is "replace", then replace the text
    return isCopy === "replace";
  }

  // For other modes, check the COPY_REPLACE setting
  const isCopy = await getCOPY_REPLACEAsync();
  logger.debug('COPY_REPLACE setting for other modes', { setting: isCopy });

  if (isCopy === "replace") {
    logger.debug('COPY_REPLACE set to replace mode');
    return true;
  }
  if (isCopy === "copy") {
    logger.debug('COPY_REPLACE set to copy mode');
    return false;
  }

  // Fallback logic
  const activeElement = document.activeElement;
  const isComplex = isComplexEditor(activeElement);
  const result = !activeElement || !isComplex;
  logger.debug('Default platform analysis', { hasActiveElement: !!activeElement, isComplex, result });
  return result;
}

async function applyTranslation(translatedText, selectionRange, platform, tabId, targetElement = null, toastId = null) {
  logger.debug('Applying translation directly to element', { platform, tabId });
  
  try {
    // Use provided target element or get from pending data
    const pendingData = getPendingTranslationData(document.activeElement, toastId);
    const target = targetElement || pendingData?.target || document.activeElement;
    
    logger.debug('Target element info for translation', {
      providedTarget: !!targetElement,
      targetTag: target?.tagName,
      isEditable: isEditableElement(target),
      isConnectedToDOM: target?.isConnected
    });
    
    if (!target || !isEditableElement(target)) {
      logger.warn('No valid target element found for translation');
      return false;
    }
    
    // Check if target element is still connected to DOM
    if (!target.isConnected) {
      logger.warn('Target element is no longer connected to DOM');
      return false;
    }
    
    // Ensure element is focusable and focus it
    try {
      if (target.focus && typeof target.focus === 'function') {
        target.focus();
        await new Promise(resolve => {
          resourceTracker.trackTimeout(resolve, 10);
        });
      }
    } catch (focusError) {
      logger.warn('Failed to focus target element', focusError);
    }
    
    // Import the appropriate strategy based on platform
    let strategyModule;
    let strategyName;
    
    switch (platform) {
      case Platform.Twitter:
        strategyName = 'TwitterStrategy';
        break;
      case Platform.WhatsApp:
        strategyName = 'WhatsAppStrategy';
        break;
      case Platform.Instagram:
        strategyName = 'InstagramStrategy';
        break;
      case Platform.Telegram:
        strategyName = 'TelegramStrategy';
        break;
      case Platform.Medium:
        strategyName = 'MediumStrategy';
        break;
      case Platform.ChatGPT:
        strategyName = 'ChatGPTStrategy';
        break;
      case Platform.Youtube:
        strategyName = 'YoutubeStrategy';
        break;
      case Platform.Discord:
        strategyName = 'DiscordStrategy';
        break;
      default:
        strategyName = 'DefaultStrategy';
    }
    
    logger.debug('Translation strategy selected', { strategy: strategyName, platform });
    strategyModule = await import(`@/features/text-field-interaction/strategies/${strategyName}.js`);
    const strategy = new strategyModule.default();
    
    // Apply translation using the strategy
    logger.debug('About to call strategy.updateElement', {
      target,
      targetIsConnected: target.isConnected,
      translatedText,
      strategy: strategyName
    });
    const success = await strategy.updateElement(target, translatedText);
    logger.debug('Translation strategy completed', { success });
    
    return success;
    
  } catch (err) {
    logger.error('Error in applyTranslation', err);
    return false;
  }
}

// Cleanup function for module-level resources
export function cleanupSmartTranslationIntegration() {
  // Clear any pending timeouts
  clearPendingNotificationData('module-cleanup');

  // Clear tracking maps
  processedMessageIds.clear();
  activeProcessing.clear();
  successfullyCompletedToastIds.clear();

  // Clear all pending translation data
  pendingTranslationByToastId.clear();

  // Cleanup all tracked resources
  resourceTracker.cleanup();

  logger.debug('SmartTranslationIntegration cleanup completed');
}
