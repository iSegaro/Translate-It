/**
 * Service orchestrator for Smart Translation Integration
 */
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { isCancellationError } from "@/shared/error-management/ErrorMatcher.js";
import NotificationManager from '@/core/managers/core/NotificationManager.js';
import { MessageFormat, MessagingContexts } from "@/shared/messaging/core/MessagingCore.js";
import { TranslationMode, getSourceLanguageAsync, getTargetLanguageAsync, getEffectiveProviderAsync } from "@/shared/config/config.js";
import { detectOS as detectPlatform } from "@/utils/browser/compatibility.js";
import { getTranslationString } from "@/utils/i18n/i18n.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { safeSendMessage } from "@/shared/messaging/core/UnifiedMessaging.js";
import { isValidSync } from "@/core/contextCore.js";
import { handleContextError } from "@/core/contextErrorHandler.js";

import { resourceTracker, processedMessageIds, activeProcessing, successfullyCompletedToastIds } from './state.js';
import { 
  storePendingTranslationData, 
  getPendingTranslationData, 
  clearPendingTranslationData, 
  clearPendingNotificationData, 
  pendingTranslationByToastId,
  abortExistingRequest,
  registerAbortController,
  activeAbortControllers
} from './dataStore.js';
import { isEditableElement, recoverTargetElement } from './elementHelper.js';
import { determineReplaceMode, applyTranslation } from './executor.js';
import { TRANSLATION_TIMEOUT, STALE_DATA_THRESHOLD } from './constants.js';
import { SimpleMarkdown, ExtractionStrategy } from "@/shared/utils/text/markdown.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SmartTranslationService');

/**
 * Main entry point for field translation
 */
export async function translateFieldViaSmartHandler({ text, target, selectionRange = null, tabId, toastId }) {
  const localNotificationManager = new NotificationManager();
  logger.info('Translation field request', { targetTag: target?.tagName });

  if (!text) {
    logger.warn('No text provided for translation');
    return;
  }

  if (!isValidSync()) {
    handleContextError(new Error('Extension context invalidated'), 'text-field-translation');
    return;
  }

  // Abort any existing request for this target element and capture its data
  const abortedData = abortExistingRequest(target);
  
  const mode = TranslationMode.Field;
  const platform = detectPlatform(target);
  const timestamp = Date.now();
  let currentToastId = toastId;
  
  // Reuse existing toast ID if we're replacing a previous request
  if (!currentToastId && abortedData && abortedData.toastId) {
    currentToastId = abortedData.toastId;
    logger.debug('Reusing existing toast ID for replacement request', { toastId: currentToastId });
  }

  let timerId = null;
  let myData = null;
  const abortController = new AbortController();

  try {
    const currentProvider = await getEffectiveProviderAsync(TranslationMode.Field);
    const currentSourceLang = await getSourceLanguageAsync();
    const currentTargetLang = await getTargetLanguageAsync();

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const translatingMessage = await getTranslationString('SELECT_ELEMENT_TRANSLATING') || 'Translating...';
    
    if (!currentToastId) {
      currentToastId = localNotificationManager.showStatus(translatingMessage, { id: `status-${Date.now()}` });
    } else {
      // If we are reusing a toast, we MUST clear its "completed" status 
      // so the new result isn't blocked by applyTranslationToTextField
      successfullyCompletedToastIds.delete(currentToastId);

      // Ensure the reused toast still shows the translating message
      localNotificationManager.update(currentToastId, translatingMessage, { type: 'status', persistent: true });
    }

    myData = storePendingTranslationData(target, mode, platform, tabId, selectionRange, timestamp, currentToastId, messageId);
    registerAbortController(target, abortController);

    // Create a catchable timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      timerId = resourceTracker.trackTimeout(() => {
        logger.debug('Translation request timeout reached');
        const timeoutError = new Error('Translation request timed out');
        timeoutError.type = ErrorTypes.TRANSLATION_TIMEOUT;
        reject(timeoutError);
      }, TRANSLATION_TIMEOUT);
    });

    // Create an abort promise
    const abortPromise = new Promise((_, reject) => {
      abortController.signal.addEventListener('abort', () => {
        const abortError = new Error('Translation request aborted by user');
        abortError.type = ErrorTypes.USER_CANCELLED;
        reject(abortError);
      });
    });

    const translationMessage = MessageFormat.create(
      MessageActions.TRANSLATE,
      {
        text, provider: currentProvider,
        sourceLanguage: currentSourceLang || 'auto',
        targetLanguage: currentTargetLang || 'fa',
        mode,
        options: { toastId: currentToastId, messageId, isDirectRequest: true }
      },
      MessagingContexts.CONTENT,
      messageId
    );
    
    // Race between the message, the timeout, and the abort signal
    const messageResult = await Promise.race([
      safeSendMessage(
        translationMessage, 
        { forceRegular: true, silent: true }, 
        'text-field-translation'
      ),
      timeoutPromise,
      abortPromise
    ]);

    if (timerId) {
      resourceTracker.clearTimer(timerId);
      timerId = null;
    }

    if (messageResult === null) {
      if (currentToastId) localNotificationManager.dismiss(currentToastId);
      clearPendingNotificationData('context-invalid');
      clearPendingTranslationData(currentToastId);
      return;
    }

    if (messageResult && messageResult.success) {
      await applyTranslationToTextField(
        messageResult.translatedText,
        messageResult.originalText,
        messageResult.mode || TranslationMode.Field,
        currentToastId,
        messageId,
        localNotificationManager
      );
    } else if (messageResult && messageResult.success === false) {
      if (currentToastId) localNotificationManager.dismiss(currentToastId);
      clearPendingNotificationData('error-response');
      clearPendingTranslationData(currentToastId);
      
      // Small delay to ensure status toast dismissal is processed before error toast appears
      await new Promise(r => setTimeout(r, 10));

      if (messageResult.error) {
        throw messageResult.error;
      }
    }
  } catch (err) {
    if (timerId) resourceTracker.clearTimer(timerId);
    
    // Check if THIS specific request was aborted for replacement using our local reference
    const isAbortedForReplacement = myData && myData.abortedForReplacement === true;

    if (isCancellationError(err)) {
      logger.debug('Text field translation request cancelled:', err.message);
      
      // If this request is being replaced, do NOT dismiss the toast and do NOT re-throw
      if (isAbortedForReplacement) {
        logger.debug('Silent cancellation for replacement - keeping toast alive');
        return; 
      }
    } 
    
    if (currentToastId && !isAbortedForReplacement) {
       localNotificationManager.dismiss(currentToastId);
       // Small delay to ensure status toast dismissal is processed
       await new Promise(r => setTimeout(r, 10));
    }

    clearPendingTranslationData(currentToastId);
    clearPendingNotificationData('error');
    throw err;
  } finally {
    if (timerId) resourceTracker.clearTimer(timerId);
    
    // Only cleanup the controller if it's still OURS (hasn't been replaced by a newer request)
    if (target && activeAbortControllers.get(target) === abortController) {
      activeAbortControllers.delete(target);
    }
  }
}

/**
 * Apply translation result to active text field
 */
export async function applyTranslationToTextField(translatedText, originalText, translationMode, toastId, messageId, notifier = null) {
  const localNotifier = notifier || new NotificationManager();
  logger.info('Applying translation to text field', { toastId, messageId });

  try {
    if (toastId && successfullyCompletedToastIds.has(toastId)) {
      return { applied: false, mode: 'already-completed' };
    }

    if (messageId && activeProcessing.has(messageId)) {
      const activeRequest = activeProcessing.get(messageId);
      if (activeRequest && activeRequest.promise) return await activeRequest.promise;
      return { applied: false, mode: 'already-processing' };
    }

    let processingPromise;
    if (messageId) {
      processingPromise = (async () => {
        try {
          const result = await processTranslationToTextFieldInternal(translatedText, originalText, translationMode, toastId, messageId, localNotifier);
          processedMessageIds.add(messageId);
          return result;
        } finally {
          activeProcessing.delete(messageId);
        }
      })();
      activeProcessing.set(messageId, { promise: processingPromise });
      return await processingPromise;
    } else {
      return await processTranslationToTextFieldInternal(translatedText, originalText, translationMode, toastId, messageId, localNotifier);
    }
  } catch (error) {
    logger.warn('Error in applyTranslationToTextField:', error.message || error);
    if (messageId) activeProcessing.delete(messageId);
    return { applied: false, mode: 'error', error: error.message };
  }
}

/**
 * Internal implementation of processing
 */
async function processTranslationToTextFieldInternal(translatedText, originalText, translationMode, toastId, messageId, notifier) {
  if (messageId && processedMessageIds.has(messageId)) return { applied: false, mode: 'already-processed' };

  if (toastId && pendingTranslationByToastId.has(toastId)) {
    const pendingData = pendingTranslationByToastId.get(toastId);
    if (pendingData.processed) return { applied: false, mode: 'already-processed' };
    if (pendingData.processing) return { applied: false, mode: 'already-processing' };
    
    pendingData.processing = true;
    pendingData.processingStarted = Date.now();
  }
  
  if (!translatedText || translatedText === 'undefined' || translatedText.trim() === '') {
    const errorMessage = 'Translation failed or returned empty result';
    if (toastId) notifier.update(toastId, errorMessage, { type: 'error', duration: 4000 });
    clearPendingNotificationData('failed');
    throw new Error(errorMessage);
  }

  // Clean the translated text before application or copy
  // Since this is for text-fields, we always want FULL_TEXT cleaning (no markdown, keep paragraphs)
  const cleanTranslatedText = SimpleMarkdown.getCleanTranslation(translatedText, ExtractionStrategy.FULL_TEXT);
  
  try {
    const currentTime = Date.now();
    const pendingTimestamp = window.pendingTranslationTimestamp;
    
    if (pendingTimestamp && (currentTime - pendingTimestamp) > STALE_DATA_THRESHOLD) {
      clearPendingTranslationData(toastId);
    }

    const pendingData = getPendingTranslationData(document.activeElement, toastId);
    let target = pendingData?.target || document.activeElement;
    const mode = pendingData?.mode || translationMode;
    const platform = detectPlatform(target);
    const selectionRange = pendingData?.selectionRange || null;
    const tabId = pendingData?.tabId || null;

    if (toastId) notifier.dismiss(toastId);
    clearPendingNotificationData('success');
    
    const isDictionaryMode = mode === TranslationMode.Dictionary_Translation || mode === TranslationMode.LEGACY_DICTIONARY;

    if (!isDictionaryMode && (!target || !isEditableElement(target))) {
      target = recoverTargetElement(pendingData);
      if (!target) throw new Error('No valid target element found');
      if (pendingData) pendingData.target = target;
    }
    
    if (isDictionaryMode) {
      clearPendingTranslationData(toastId);
      return { applied: true, mode: TranslationMode.Dictionary_Translation };
    }
    
    const isReplaceMode = await determineReplaceMode(mode, platform);
    
    if (isReplaceMode && target && isEditableElement(target)) {
      const wasApplied = await applyTranslation(cleanTranslatedText, selectionRange, platform, tabId, target, toastId);

      if (wasApplied && toastId && pendingTranslationByToastId.has(toastId)) {
        const data = pendingTranslationByToastId.get(toastId);
        data.processed = true;
        data.applied = true;
        data.processedAt = Date.now();
        data.processing = false;
        successfullyCompletedToastIds.add(toastId);
      }
      return { applied: wasApplied, mode: 'replace' };
    } else {
      await copyToClipboard(cleanTranslatedText, toastId, notifier);
      clearPendingTranslationData(toastId);
      return { applied: true, mode: 'copy' };
    }
  } catch (error) {
    if (toastId && pendingTranslationByToastId.has(toastId)) {
      pendingTranslationByToastId.get(toastId).processing = false;
    }
    if (toastId) notifier.dismiss(toastId);
    clearPendingTranslationData(toastId);
    throw error;
  }
}

async function copyToClipboard(text, toastId, notifier) {
  try {
    await navigator.clipboard.writeText(text);
    const successMessage = await getTranslationString("STATUS_SMARTTRANSLATE_COPIED") || "متن ترجمه شده در حافظه کپی شد";
    if (toastId) notifier.update(toastId, successMessage, { type: 'success', duration: 4000 });
    else notifier.show(successMessage, 'success');
  } catch (error) {
    const errorMessage = await getTranslationString("STATUS_SMART_TRANSLATE_COPY_ERROR") || "خطا در کپی کردن متن";
    if (toastId) notifier.update(toastId, errorMessage, { type: 'error', duration: 4000 });
    else notifier.show(errorMessage, 'error');
    
    throw error;
  }
}

/**
 * Cleanup for module-level resources
 */
export function cleanupSmartTranslationIntegration() {
  clearPendingNotificationData('module-cleanup');
  processedMessageIds.clear();
  activeProcessing.clear();
  successfullyCompletedToastIds.clear();
  pendingTranslationByToastId.clear();
  resourceTracker.cleanup();
  logger.debug('SmartTranslationIntegration cleanup completed');
}
