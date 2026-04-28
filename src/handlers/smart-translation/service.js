/**
 * Service orchestrator for Smart Translation Integration
 */
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { isCancellationError } from "@/shared/error-management/ErrorMatcher.js";
import NotificationManager from '@/core/managers/core/NotificationManager.js';
import { MessageFormat, MessagingContexts } from "@/shared/messaging/core/MessagingCore.js";
import ExtensionContextManager from "@/core/extensionContext.js";
import { TranslationMode, getTranslationApiAsync, getSourceLanguageAsync, getTargetLanguageAsync } from "@/shared/config/config.js";
import { detectOS as detectPlatform } from "@/utils/browser/compatibility.js";
import { getTranslationString } from "@/utils/i18n/i18n.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";

import { resourceTracker, processedMessageIds, activeProcessing, successfullyCompletedToastIds } from './state.js';
import { storePendingTranslationData, getPendingTranslationData, clearPendingTranslationData, clearPendingNotificationData, pendingTranslationByToastId } from './dataStore.js';
import { isEditableElement, recoverTargetElement } from './elementHelper.js';
import { determineReplaceMode, applyTranslation } from './executor.js';
import { TRANSLATION_TIMEOUT, STALE_DATA_THRESHOLD } from './constants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SmartTranslationService');
const notificationManager = new NotificationManager();

/**
 * Main entry point for field translation
 */
export async function translateFieldViaSmartHandler({ text, target, selectionRange = null, tabId, toastId }) {
  logger.info('Translation field request', { targetTag: target?.tagName });

  if (!text) {
    logger.warn('No text provided for translation');
    return;
  }

  if (!ExtensionContextManager.isValidSync()) {
    ExtensionContextManager.handleContextError(new Error('Extension context invalidated'), 'text-field-translation');
    return;
  }

  const mode = TranslationMode.Field;
  const platform = detectPlatform(target);
  const timestamp = Date.now();
  let currentToastId = toastId;

  try {
    const currentProvider = await getTranslationApiAsync();
    const currentSourceLang = await getSourceLanguageAsync();
    const currentTargetLang = await getTargetLanguageAsync();

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const translatingMessage = await getTranslationString('SELECT_ELEMENT_TRANSLATING') || 'Translating...';
    
    if (!currentToastId) {
      currentToastId = notificationManager.showStatus(translatingMessage, { id: `status-${Date.now()}` });
    }

    storePendingTranslationData(target, mode, platform, tabId, selectionRange, timestamp, currentToastId, messageId);

    window.pendingTranslationDismissTimeout = resourceTracker.trackTimeout(() => {
      logger.debug('Translation request timeout reached');
      if (currentToastId) notificationManager.dismiss(currentToastId);
      clearPendingNotificationData('translation-timeout');
      clearPendingTranslationData(currentToastId);
    }, TRANSLATION_TIMEOUT);

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
    
    const messageResult = await ExtensionContextManager.safeSendMessage(translationMessage, 'text-field-translation');

    if (messageResult === null) {
      if (currentToastId) notificationManager.dismiss(currentToastId);
      clearPendingNotificationData('context-invalid');
      clearPendingTranslationData(currentToastId);
      return;
    }

    if (messageResult && messageResult.success) {
      if (window.pendingTranslationDismissTimeout) {
        resourceTracker.clearTimer(window.pendingTranslationDismissTimeout);
        window.pendingTranslationDismissTimeout = null;
      }

      await applyTranslationToTextField(
        messageResult.translatedText,
        messageResult.originalText,
        messageResult.mode || TranslationMode.Field,
        currentToastId,
        messageId
      );
    } else if (messageResult && messageResult.success === false) {
      if (currentToastId) notificationManager.dismiss(currentToastId);
      clearPendingNotificationData('error-response');
      clearPendingTranslationData(currentToastId);
      if (messageResult.error) {
        await ErrorHandler.getInstance().handle(messageResult.error, { context: 'text-field-response', showToast: true });
      }
    }
  } catch (err) {
    if (isCancellationError(err)) {
      logger.debug('Text field translation request cancelled:', err.message);
    } else {
      logger.error('Text field translation request failed:', err);
      await ErrorHandler.getInstance().handle(err, { context: 'text-field-request', showToast: true });
    }
    
    if (currentToastId) notificationManager.dismiss(currentToastId);
    clearPendingTranslationData(currentToastId);
    clearPendingNotificationData('error');
  }
}

/**
 * Apply translation result to active text field
 */
export async function applyTranslationToTextField(translatedText, originalText, translationMode, toastId, messageId) {
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
          const result = await processTranslationToTextFieldInternal(translatedText, originalText, translationMode, toastId, messageId);
          processedMessageIds.add(messageId);
          return result;
        } finally {
          activeProcessing.delete(messageId);
        }
      })();
      activeProcessing.set(messageId, { promise: processingPromise });
      return await processingPromise;
    } else {
      return await processTranslationToTextFieldInternal(translatedText, originalText, translationMode, toastId, messageId);
    }
  } catch (error) {
    logger.error('Error in applyTranslationToTextField', error);
    if (messageId) activeProcessing.delete(messageId);
    return { applied: false, mode: 'error', error: error.message };
  }
}

/**
 * Internal implementation of processing
 */
async function processTranslationToTextFieldInternal(translatedText, originalText, translationMode, toastId, messageId) {
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
    if (toastId) notificationManager.update(toastId, errorMessage, { type: 'error', duration: 4000 });
    clearPendingNotificationData('failed');
    throw new Error(errorMessage);
  }
  
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

    if (toastId) notificationManager.dismiss(toastId);
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
      const wasApplied = await applyTranslation(translatedText, selectionRange, platform, tabId, target, toastId);
      
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
      await copyToClipboard(translatedText, toastId);
      clearPendingTranslationData(toastId);
      return { applied: true, mode: 'copy' };
    }
  } catch (error) {
    if (toastId && pendingTranslationByToastId.has(toastId)) {
      pendingTranslationByToastId.get(toastId).processing = false;
    }
    if (toastId) notificationManager.dismiss(toastId);
    await ErrorHandler.getInstance().handle(error, { context: 'text-field-application', type: ErrorTypes.TRANSLATION_FAILED, showToast: true });
    clearPendingTranslationData(toastId);
    throw error;
  }
}

async function copyToClipboard(text, toastId) {
  try {
    await navigator.clipboard.writeText(text);
    const successMessage = await getTranslationString("STATUS_SMARTTRANSLATE_COPIED") || "متن ترجمه شده در حافظه کپی شد";
    if (toastId) notificationManager.update(toastId, successMessage, { type: 'success', duration: 4000 });
    else notificationManager.show(successMessage, 'success');
  } catch (error) {
    const errorMessage = await getTranslationString("STATUS_SMART_TRANSLATE_COPY_ERROR") || "خطا در کپی کردن متن";
    if (toastId) notificationManager.update(toastId, errorMessage, { type: 'error', duration: 4000 });
    else notificationManager.show(errorMessage, 'error');
    const { sendMessage } = await import('@/shared/messaging/core/UnifiedMessaging.js');
    await sendMessage({ action: MessageActions.HANDLE_ERROR, data: { error, context: 'smartTranslation-clipboard' } }).catch(()=>{});
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
