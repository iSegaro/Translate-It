/**
 * Service orchestrator for Smart Translation Integration
 */
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { isCancellationError } from "@/shared/error-management/ErrorMatcher.js";
import NotificationManager from '@/core/managers/core/NotificationManager.js';
import { MessageFormat, MessagingContexts } from "@/shared/messaging/core/MessagingCore.js";
import { TranslationMode, getSourceLanguageAsync, getTargetLanguageAsync, getEffectiveProviderAsync } from "@/shared/config/config.js";
import { detectSite } from "@/utils/browser/compatibility.js";
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
  beginFieldTranslationRequest,
  isCurrentFieldTranslationRequest,
  releaseFieldTranslationRequest,
  cleanupSupersededFieldTranslationState
} from './dataStore.js';
import { isEditableElement, recoverTargetElement } from './elementHelper.js';
import { determineReplaceMode, applyTranslation } from './executor.js';
import { TRANSLATION_TIMEOUT, STALE_DATA_THRESHOLD } from './constants.js';
import { SimpleMarkdown, ExtractionStrategy } from "@/shared/utils/text/markdown.js";
import { markFieldTranslationRequestError } from './translationErrorOwnership.js';
import { translationRequestTracker } from '@/core/services/translation/TranslationRequestTracker.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SmartTranslationService');

function terminalizeFieldRequest(ownership, outcome, details = {}) {
  const messageId = ownership?.messageId;
  if (!messageId) return null;

  const isReplacement = outcome === 'replacement';
  if (ownership.target && !isReplacement && !isCurrentFieldTranslationRequest(ownership.target, ownership)) {
    return null;
  }
  if (!translationRequestTracker.isRequestActive(messageId)) return null;

  switch (outcome) {
    case 'completed':
      return translationRequestTracker.completeRequest(messageId, { success: true, ...details });
    case 'failed':
      return translationRequestTracker.failRequest(messageId, details.error);
    case 'cancelled':
      return translationRequestTracker.cancelRequest(messageId, details.reason);
    case 'replacement':
      return translationRequestTracker.cancelRequest(messageId, 'replacement');
    case 'timeout':
      return translationRequestTracker.markTimeout(messageId);
    default:
      return null;
  }
}

function isSuccessfulFieldApplication(result) {
  return result?.applied === true || result?.mode === 'already-completed';
}

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

  // Establish latest-request ownership before asynchronous setup.
  const { ownership, previous } = beginFieldTranslationRequest(target);
  const inheritedState = previous?.supersededState || previous || null;
  ownership.supersededState = inheritedState;
  const isCurrent = () => isCurrentFieldTranslationRequest(target, ownership);
  let currentToastId = null;
  let timerId = null;
  let myData = null;
  let setupPhase = 'pre-request';
  let inheritedToastAdopted = !inheritedState?.toastId;
  let inheritedPendingAdopted = !inheritedState?.data;
  let terminalOwner = null;
  let terminalError = null;
  let abortHandler = null;
  const claimTerminalOwner = (owner, error = null) => {
    if (terminalOwner) return false;
    terminalOwner = owner;
    terminalError = error;
    return true;
  };

  try {
    terminalizeFieldRequest(previous, 'replacement');

    const mode = TranslationMode.Field;
    const platform = detectSite();
    const timestamp = Date.now();
    currentToastId = toastId || previous?.toastId || inheritedState?.toastId || null;

    setupPhase = 'provider-resolution';
    const currentProvider = await getEffectiveProviderAsync(TranslationMode.Field);
    setupPhase = 'source-language-resolution';
    const currentSourceLang = await getSourceLanguageAsync();
    setupPhase = 'target-language-resolution';
    const currentTargetLang = await getTargetLanguageAsync();

    setupPhase = 'request-construction';
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setupPhase = 'ui-setup';
    const translatingMessage = await getTranslationString('SELECT_ELEMENT_TRANSLATING') || 'Translating...';

    if (!isCurrent()) return;
    ownership.messageId = messageId;
    
    if (!currentToastId) {
      currentToastId = localNotificationManager.showStatus(translatingMessage, { id: `status-${Date.now()}` });
    } else {
      // If we are reusing a toast, we MUST clear its "completed" status 
      // so the new result isn't blocked by applyTranslationToTextField
      successfullyCompletedToastIds.delete(currentToastId);

      // Ensure the reused toast still shows the translating message
      localNotificationManager.update(currentToastId, translatingMessage, { type: 'status', persistent: true });
      inheritedToastAdopted = currentToastId === inheritedState?.toastId;
    }
    ownership.toastId = currentToastId;
    
    if (!isCurrent()) return;
    myData = storePendingTranslationData(target, mode, platform, tabId, selectionRange, timestamp, currentToastId, messageId, ownership);
    if (!myData || !isCurrent()) return;
    inheritedPendingAdopted = true;
    if (inheritedState && inheritedState !== ownership) {
      cleanupSupersededFieldTranslationState(inheritedState);
    }
    if (
      inheritedState?.toastId
      && !inheritedToastAdopted
      && inheritedState.toastId !== currentToastId
    ) {
      localNotificationManager.dismiss(inheritedState.toastId);
      inheritedToastAdopted = true;
    }
    ownership.supersededState = ownership;

    setupPhase = 'request-setup';
    // Create a catchable timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      timerId = resourceTracker.trackTimeout(() => {
        logger.debug('Translation request timeout reached');
        const timeoutError = new Error('Translation request timed out');
        timeoutError.type = ErrorTypes.TRANSLATION_TIMEOUT;
        if (!claimTerminalOwner('timeout', timeoutError)) return;

        ownership.controller.abort();
        void safeSendMessage({
          action: MessageActions.CANCEL_TRANSLATION,
          data: { messageId, reason: 'Translation timed out', timeout: true }
        }, { forceRegular: true, silent: true }, 'text-field-timeout').catch(() => {});
        reject(timeoutError);
      }, TRANSLATION_TIMEOUT);
    });

    // Create an abort promise
    const abortPromise = new Promise((_, reject) => {
      abortHandler = () => {
        // Timeout owns semantic settlement; abort only stops transport.
        if (terminalOwner === 'timeout') return;

        const isReplacement = ownership.replaced || !isCurrent();
        if (!claimTerminalOwner(isReplacement ? 'replacement' : 'operation-abort')) return;

        const abortError = new Error(
          isReplacement ? 'Translation request replaced' : 'Translation request aborted'
        );
        abortError.operationAborted = true;
        abortError.cancellationReason = isReplacement ? 'replacement' : 'operation-abort';
        reject(abortError);
      };

      ownership.controller.signal.addEventListener('abort', abortHandler);
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

    if (!isCurrent()) return;
    
    // Race between the message, the timeout, and the abort signal
    let messageResult;
    try {
      messageResult = await Promise.race([
        safeSendMessage(
          translationMessage, 
          { forceRegular: true, silent: true }, 
          'text-field-translation'
        ),
        timeoutPromise,
        abortPromise
      ]);
    } catch (error) {
      throw markFieldTranslationRequestError(error);
    }

    if (!isCurrent()) return;

    setupPhase = 'application';

    if (timerId) {
      resourceTracker.clearTimer(timerId);
      timerId = null;
    }

    if (messageResult === null) {
      if (currentToastId) localNotificationManager.dismiss(currentToastId);
      clearPendingNotificationData('context-invalid', ownership);
      clearPendingTranslationData(currentToastId, ownership);
      terminalizeFieldRequest(ownership, 'cancelled', { reason: 'context-invalidated' });
      return;
    }

    if (messageResult && messageResult.success) {
      const applicationResult = await applyTranslationToTextField(
        messageResult.translatedText,
        messageResult.originalText,
        messageResult.mode || TranslationMode.Field,
        currentToastId,
        messageId,
        localNotificationManager,
        ownership
      );
      if (applicationResult?.mode === 'stale') return;
      if (isSuccessfulFieldApplication(applicationResult)) {
        terminalizeFieldRequest(ownership, 'completed', { result: applicationResult });
      } else {
        terminalizeFieldRequest(ownership, 'failed', { error: applicationResult?.error || 'Field application failed' });
      }
    } else if (messageResult && messageResult.success === false) {
      if (!isCurrent()) return;
      if (currentToastId) localNotificationManager.dismiss(currentToastId);
      clearPendingNotificationData('error-response', ownership);
      clearPendingTranslationData(currentToastId, ownership);
      
      // Small delay to ensure status toast dismissal is processed before error toast appears
      await new Promise(r => setTimeout(r, 10));

      const requestError = messageResult.error || 'Translation request failed';
      terminalizeFieldRequest(ownership, 'failed', { error: requestError });
      if (messageResult.error) {
        throw markFieldTranslationRequestError(messageResult.error);
      }
    } else {
      if (!isCurrent()) return;
      if (currentToastId) localNotificationManager.dismiss(currentToastId);
      clearPendingNotificationData('invalid-response', ownership);
      clearPendingTranslationData(currentToastId, ownership);
      terminalizeFieldRequest(ownership, 'failed', { error: 'Invalid translation response' });
    }
  } catch (err) {
    if (timerId) resourceTracker.clearTimer(timerId);
    
    const isAbortedForReplacement = ownership.replaced || !isCurrent();

    if (isAbortedForReplacement) return;

    const errorForCaller = (
      setupPhase === 'provider-resolution'
      || setupPhase === 'source-language-resolution'
      || setupPhase === 'target-language-resolution'
    ) ? markFieldTranslationRequestError(err) : err;

    const isTimeout = errorForCaller?.type === ErrorTypes.TRANSLATION_TIMEOUT;
    const isCancellation = isCancellationError(errorForCaller);

    if (terminalOwner === 'timeout' && !isTimeout) {
      throw terminalError;
    }
    if (!terminalOwner) {
      claimTerminalOwner(
        isTimeout ? 'timeout' : isCancellation ? 'user-cancellation' : 'provider-error',
        errorForCaller
      );
    }

    if (isCancellation) {
      logger.debug('Text field translation request cancelled:', errorForCaller.message);
      
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

    if (currentToastId || !inheritedState) {
      clearPendingTranslationData(currentToastId, ownership);
    }
    clearPendingNotificationData('error', ownership);
    if (inheritedState && !inheritedPendingAdopted) {
      cleanupSupersededFieldTranslationState(inheritedState);
    }
    if (
      inheritedState?.toastId
      && !inheritedToastAdopted
      && inheritedState.toastId !== currentToastId
    ) {
      localNotificationManager.dismiss(inheritedState.toastId);
    }
    if (isTimeout) {
      terminalizeFieldRequest(ownership, 'timeout');
    } else if (isCancellation) {
      terminalizeFieldRequest(ownership, 'cancelled', { reason: errorForCaller?.type || 'user_cancelled' });
    } else {
      terminalizeFieldRequest(ownership, 'failed', { error: err });
    }
    throw errorForCaller;
  } finally {
    if (timerId) resourceTracker.clearTimer(timerId);
    if (abortHandler) {
      ownership.controller.signal.removeEventListener('abort', abortHandler);
    }
    
    releaseFieldTranslationRequest(target, ownership);
  }
}

/**
 * Apply translation result to active text field
 */
export async function applyTranslationToTextField(translatedText, originalText, translationMode, toastId, messageId, notifier = null, ownership = null) {
  const localNotifier = notifier || new NotificationManager();
  logger.info('Applying translation to text field', { toastId, messageId });

  try {
    if (ownership && !isCurrentFieldTranslationRequest(ownership.target, ownership)) {
      return { applied: false, mode: 'stale' };
    }

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
          const result = await processTranslationToTextFieldInternal(translatedText, originalText, translationMode, toastId, messageId, localNotifier, ownership);
          processedMessageIds.add(messageId);
          return result;
        } finally {
          activeProcessing.delete(messageId);
        }
      })();
      activeProcessing.set(messageId, { promise: processingPromise });
      return await processingPromise;
    } else {
      return await processTranslationToTextFieldInternal(translatedText, originalText, translationMode, toastId, messageId, localNotifier, ownership);
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
async function processTranslationToTextFieldInternal(translatedText, originalText, translationMode, toastId, messageId, notifier, ownership = null) {
  if (ownership && !isCurrentFieldTranslationRequest(ownership.target, ownership)) {
    return { applied: false, mode: 'stale' };
  }

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
    clearPendingNotificationData('failed', ownership);
    throw new Error(errorMessage);
  }

  // Clean the translated text before application or copy
  // Since this is for text-fields, we always want FULL_TEXT cleaning (no markdown, keep paragraphs)
  const cleanTranslatedText = SimpleMarkdown.getCleanTranslation(translatedText, ExtractionStrategy.FULL_TEXT);
  
  try {
    const currentTime = Date.now();
    const pendingTimestamp = window.pendingTranslationTimestamp;
    
    if (pendingTimestamp && (currentTime - pendingTimestamp) > STALE_DATA_THRESHOLD) {
      clearPendingTranslationData(toastId, ownership);
    }

    const pendingData = getPendingTranslationData(document.activeElement, toastId, ownership);
    let target = pendingData?.target || document.activeElement;
    const mode = pendingData?.mode || translationMode;
    const platform = detectSite();
    const selectionRange = pendingData?.selectionRange || null;
    const tabId = pendingData?.tabId || null;

    if (toastId) notifier.dismiss(toastId);
    clearPendingNotificationData('success', ownership);
    
    const isDictionaryMode = mode === TranslationMode.Dictionary_Translation || mode === TranslationMode.LEGACY_DICTIONARY;

    if (!isDictionaryMode && (!target || !isEditableElement(target))) {
      target = recoverTargetElement(pendingData);
      if (!target) throw new Error('No valid target element found');
      if (pendingData) pendingData.target = target;
    }
    
    if (isDictionaryMode) {
      clearPendingTranslationData(toastId, ownership);
      return { applied: true, mode: TranslationMode.Dictionary_Translation };
    }
    
    const isReplaceMode = await determineReplaceMode(mode, platform);

    if (ownership && !isCurrentFieldTranslationRequest(ownership.target, ownership)) {
      return { applied: false, mode: 'stale' };
    }

    if (isReplaceMode && target && isEditableElement(target)) {
      if (ownership && !isCurrentFieldTranslationRequest(ownership.target, ownership)) {
        return { applied: false, mode: 'stale' };
      }
       const applicationResult = await applyTranslation(
         cleanTranslatedText,
         selectionRange,
         platform,
         tabId,
         target,
         toastId,
         ownership ? {
           isCurrent: () => isCurrentFieldTranslationRequest(ownership.target, ownership)
         } : null
       );
       if (applicationResult?.mode === 'stale') return applicationResult;
       const wasApplied = applicationResult === true || applicationResult?.applied === true;

      if (wasApplied && toastId && pendingTranslationByToastId.has(toastId)
        && (!ownership || isCurrentFieldTranslationRequest(ownership.target, ownership))) {
        const data = pendingTranslationByToastId.get(toastId);
        if (!ownership || data.ownership === ownership) {
          data.processed = true;
          data.applied = true;
          data.processedAt = Date.now();
          data.processing = false;
          successfullyCompletedToastIds.add(toastId);
        }
      }
      clearPendingTranslationData(toastId, ownership);
       return { applied: wasApplied, mode: 'replace' };
    } else {
      if (ownership && !isCurrentFieldTranslationRequest(ownership.target, ownership)) {
        return { applied: false, mode: 'stale' };
      }
      await copyToClipboard(cleanTranslatedText, toastId, notifier, ownership);
      if (ownership && !isCurrentFieldTranslationRequest(ownership.target, ownership)) {
        return { applied: false, mode: 'stale' };
      }
      clearPendingTranslationData(toastId, ownership);
      return { applied: true, mode: 'copy' };
    }
  } catch (error) {
    if ((!ownership || isCurrentFieldTranslationRequest(ownership.target, ownership))
      && toastId && pendingTranslationByToastId.has(toastId)) {
      pendingTranslationByToastId.get(toastId).processing = false;
    }
    if (!ownership || isCurrentFieldTranslationRequest(ownership.target, ownership)) {
      if (toastId) notifier.dismiss(toastId);
      clearPendingTranslationData(toastId, ownership);
    }
    throw error;
  }
}

async function copyToClipboard(text, toastId, notifier, ownership = null) {
  try {
    if (ownership && !isCurrentFieldTranslationRequest(ownership.target, ownership)) return;
    await navigator.clipboard.writeText(text);
    if (ownership && !isCurrentFieldTranslationRequest(ownership.target, ownership)) return;
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
