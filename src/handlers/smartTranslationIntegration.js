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
import { isComplexEditor } from "../utils/framework/framework-compat/index.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import browser from "webextension-polyfill";
import ResourceTracker from '@/core/memory/ResourceTracker.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SmartTranslation');

// Create a global resource tracker for this module
const resourceTracker = new ResourceTracker('smart-translation-integration');



// Helper function to clear pending notification data and timeout
function clearPendingNotificationData(context = 'cleanup') {
  // Clear timeout if it exists
  if (window.pendingTranslationDismissTimeout) {
    resourceTracker.clearTimeout(window.pendingTranslationDismissTimeout);
    window.pendingTranslationDismissTimeout = null;
  }
  
  logger.debug('Pending notification data cleared', { context });
}

export async function translateFieldViaSmartHandler({ text, target, selectionRange = null, tabId, toastId, dismissTimeout }) {
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

  const mode = selectionRange ? TranslationMode.SelectElement : TranslationMode.Field;
  const platform = detectPlatform(target);
  const timestamp = Date.now();

  try {
    // Store target element for later use when translation result arrives
    // Add timestamp to track stale data
    window.pendingTranslationTarget = target;
    window.pendingTranslationMode = mode;
    window.pendingTranslationPlatform = platform;
    window.pendingTranslationTabId = tabId;
    window.pendingSelectionRange = selectionRange;
    window.pendingTranslationTimestamp = timestamp;
    
    logger.debug('Stored pending translation data', { 
      target: target?.tagName, 
      mode, 
      platform, 
      timestamp 
    });
    
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
    pageEventBus.emit('show-notification', { id: newToastId, message: 'Translating...', type: 'status' });

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
        options: { toastId: newToastId }
      },
      MessagingContexts.CONTENT
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
    
    logger.debug('Translation request dispatched (fire-and-forget)');
    
    // Note: The actual translation result will arrive via TRANSLATION_RESULT_UPDATE message
    // which is handled by ContentMessageHandler and will call applyTranslationToTextField
    // No need to wait for response here - this prevents timeout issues
    
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
    clearPendingNotificationData('translateFieldViaSmartHandler-error');
  }
}

/**
 * Apply translation result to active text field
 * This function is called when TRANSLATION_RESULT_UPDATE message is received
 * @param {string} translatedText - The translated text
 * @param {string} originalText - The original text
 * @param {string} translationMode - Translation mode
 * @returns {Promise<Object>} Application result
 */
export async function applyTranslationToTextField(translatedText, originalText, translationMode, toastId) {
  logger.info('Applying translation to text field', { 
    translatedLength: translatedText?.length, 
    originalLength: originalText?.length, 
    translationMode,
    hasToastId: !!toastId
  });
  
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
    
    // Use centralized error handling
    const errorHandler = ErrorHandler.getInstance();
    await errorHandler.handle(new Error(errorMessage), {
      context: 'text-field-empty-result',
      type: ErrorTypes.TRANSLATION_FAILED,
      showToast: true
    });
    
    // Clear pending translation data
    clearPendingTranslationData();
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
      clearPendingTranslationData();
    }
    
    // Use stored pending data or fallback to active element
    const target = window.pendingTranslationTarget || document.activeElement;
    const mode = window.pendingTranslationMode || translationMode;
    const platform = window.pendingTranslationPlatform || detectPlatform(target);
    const selectionRange = window.pendingSelectionRange || null;
    const tabId = window.pendingTranslationTabId || null;
    
    logger.debug('Target element info', {
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
      throw new Error('No valid target element found');
    }
    
    // For dictionary mode, we can proceed without editable target (copy mode)
    if (isDictionaryMode && (!target || !isEditableElement(target))) {
      logger.debug('Dictionary mode with non-editable target - using copy mode');
    }
    
    // For dictionary mode, we usually just display in tooltip/popup, not replace text
    if (isDictionaryMode) {
      logger.debug('Dictionary mode translation completed');
      return { applied: true, mode: 'dictionary' };
    }
    
    const isReplaceMode = await determineReplaceMode(mode, platform);
    logger.debug('Replace mode determined', { isReplaceMode, mode, platform });
    
    if (isReplaceMode && target && isEditableElement(target)) {
      logger.debug('Calling applyTranslation');
      const wasApplied = await applyTranslation(translatedText, selectionRange, platform, tabId, target);
      logger.debug('applyTranslation completed', { success: wasApplied });
      
      // Clear pending data after successful application
      if (wasApplied) {
        clearPendingTranslationData();
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
      clearPendingTranslationData();
      
      return { applied: true, mode: 'copy' };
    }
    
  } catch (error) {
    logger.error('Error in applyTranslationToTextField', error);
    
    // Use centralized error handling
    const errorHandler = ErrorHandler.getInstance();
    await errorHandler.handle(error, {
      context: 'text-field-application',
      type: ErrorTypes.TRANSLATION_FAILED,
      showToast: true
    });
    
    // Clear pending data on error as well
    clearPendingTranslationData();
    throw error;
  }
}

/**
 * Clear pending translation data
 */
function clearPendingTranslationData() {
  window.pendingTranslationTarget = null;
  window.pendingTranslationMode = null;
  window.pendingTranslationPlatform = null;
  window.pendingTranslationTabId = null;
  window.pendingSelectionRange = null;
  window.pendingTranslationTimestamp = null;
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
  
  if (mode === TranslationMode.SelectElement) {
    logger.debug('SelectElement mode detected, using replace mode');
    return true;
  }

  // Check for special sites first, if platform is not default
  if (platform !== Platform.Default) {
    const replaceSpecial = await getREPLACE_SPECIAL_SITESAsync();
    logger.debug('Special platform detected', { platform, replaceSpecial });
    // If REPLACE_SPECIAL_SITES is true, then replace. Otherwise, proceed to general COPY_REPLACE check.
    if (replaceSpecial) {
      return true; // Replace on special sites if setting is true
    }
  }

  // Now check the general COPY_REPLACE setting
  const isCopy = await getCOPY_REPLACEAsync();
  logger.debug('COPY_REPLACE setting retrieved', { setting: isCopy });

  if (isCopy === "replace") {
    logger.debug('COPY_REPLACE set to replace mode');
    return true;
  }
  // If isCopy is "copy", then it's copy mode unless overridden by special site logic (which is handled above)
  if (isCopy === "copy") {
    logger.debug('COPY_REPLACE set to copy mode');
    return false;
  }

  // Fallback for when COPY_REPLACE is not explicitly 'copy' or 'replace' (shouldn't happen if it's an enum)
  // Or if it's a default platform and COPY_REPLACE is not 'replace'
  const activeElement = document.activeElement;
  const isComplex = isComplexEditor(activeElement);
  const result = !activeElement || !isComplex;
  logger.debug('Default platform analysis', { hasActiveElement: !!activeElement, isComplex, result });
  return result;
}

async function applyTranslation(translatedText, selectionRange, platform, tabId, targetElement = null) {
  logger.debug('Applying translation directly to element', { platform, tabId });
  
  try {
    // Use provided target element or fallback
    const target = targetElement || window.pendingTranslationTarget || document.activeElement;
    
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
  
  // Cleanup all tracked resources
  resourceTracker.cleanup();
  
  logger.debug('SmartTranslationIntegration cleanup completed');
}
