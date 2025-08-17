import { ErrorHandler } from "../error-management/ErrorHandler.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import ExtensionContextManager from "../utils/core/extensionContext.js";
import { MessageFormat, MessagingContexts } from "../messaging/core/MessagingCore.js";
import { TranslationMode, getREPLACE_SPECIAL_SITESAsync, getCOPY_REPLACEAsync, getTranslationApiAsync, getSourceLanguageAsync, getTargetLanguageAsync } from "../config.js";
import { detectPlatform, Platform } from "../utils/browser/platform.js";
import { getTranslationString } from "../utils/i18n/i18n.js";
import { getScopedLogger } from "../utils/core/logger.js";
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { isComplexEditor } from "../utils/framework/framework-compat/index.js";
import { MessageActions } from "../messaging/core/MessageActions.js";
import browser from "webextension-polyfill";
const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SmartTranslation');

// Helper function to dismiss pending translation notification
function dismissPendingTranslationNotification(context = 'unknown') {
  if (window.pendingTranslationStatusNode && window.pendingTranslationNotifier) {
    try {
      window.pendingTranslationNotifier.dismiss(window.pendingTranslationStatusNode);
      window.pendingTranslationStatusNode = null;
      window.pendingTranslationNotifier = null;
      logger.debug('Status notification dismissed', { context });
    } catch (notifierError) {
      logger.error('Failed to dismiss notification', { context, error: notifierError });
    }
  }
}

export async function translateFieldViaSmartHandler({ text, target, selectionRange = null, tabId }) {
  logger.info('Translation field request', { textLength: text?.length, targetTag: target?.tagName, mode: selectionRange ? 'SelectElement' : 'Field' });
  
  if (!text) {
    logger.warn('No text provided for translation');
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
        options: {}
      },
      MessagingContexts.CONTENT
    );
    
    // Use ExtensionContextManager for safe message sending
    ExtensionContextManager.safeSendMessage(translationMessage, 'smartTranslation');
    
    logger.debug('Translation request dispatched (fire-and-forget)');
    
    // Note: The actual translation result will arrive via TRANSLATION_RESULT_UPDATE message
    // which is handled by ContentMessageHandler and will call applyTranslationToTextField
    // No need to wait for response here - this prevents timeout issues
    
  } catch (err) {
    const handler = ErrorHandler.getInstance();
    handler.handle(err, { type: ErrorTypes.SERVICE, context: 'smartTranslate-handler' });
    
    // Dismiss notification on error
    dismissPendingTranslationNotification('translateFieldViaSmartHandler-error');
    
    // Handle translation error locally
    await handleTranslationError(err, mode);
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
export async function applyTranslationToTextField(translatedText, originalText, translationMode) {
  logger.info('Applying translation to text field', { translatedLength: translatedText?.length, originalLength: originalText?.length, translationMode });
  
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
    
    // Don't clear pending data immediately - keep it for potential subsequent operations
    // Only clear after successful application or significant time gap
    
    // Dismiss the status notification if it exists
    if (window.pendingTranslationStatusNode && window.pendingTranslationNotifier) {
      try {
        logger.debug('Attempting to dismiss notification', {
          statusNode: !!window.pendingTranslationStatusNode,
          notifier: !!window.pendingTranslationNotifier,
          statusNodeType: window.pendingTranslationStatusNode?.constructor.name,
          statusNodeParent: !!window.pendingTranslationStatusNode?.parentNode,
          statusNodeRemove: typeof window.pendingTranslationStatusNode?.remove
        });
        
        window.pendingTranslationNotifier.dismiss(window.pendingTranslationStatusNode);
        window.pendingTranslationStatusNode = null;
        window.pendingTranslationNotifier = null;
        logger.debug('Status notification dismissed successfully');
      } catch (notifierError) {
        logger.error('Failed to dismiss notification', notifierError);
      }
    } else {
      logger.debug('No notification to dismiss', {
        statusNode: !!window.pendingTranslationStatusNode,
        notifier: !!window.pendingTranslationNotifier
      });
    }
    
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
      await copyToClipboard(translatedText);
      
      // Clear pending data after copy operation
      clearPendingTranslationData();
      
      return { applied: true, mode: 'copy' };
    }
    
  } catch (error) {
    logger.error('Error in applyTranslationToTextField', error);
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

  const isCopy = await getCOPY_REPLACEAsync();
  logger.debug('COPY_REPLACE setting retrieved', { setting: isCopy });
  
  if (isCopy === "replace") {
    logger.debug('COPY_REPLACE set to replace mode');
    return true;
  }
  if (isCopy === "copy") {
    logger.debug('COPY_REPLACE set to copy mode');
    return false;
  }

  if (platform !== Platform.Default) {
    const replaceSpecial = await getREPLACE_SPECIAL_SITESAsync();
    logger.debug('Special platform detected', { platform, replaceSpecial });
    return replaceSpecial;
  }

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
        await new Promise(resolve => setTimeout(resolve, 10));
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
    strategyModule = await import(`../strategies/${strategyName}.js`);
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

export async function handleTranslationError(error, mode = 'field') {
  logger.error('Handling translation error for mode:', mode, error);
  let errorMessage;
  try {
    // Dismiss any pending notifications
    dismissPendingTranslationNotification('handleTranslationError');

    // Show in-page error notification using NotificationManager
    errorMessage = error?.message || error || 'Translation failed';
    
    // Import NotificationManager dynamically
    const { default: NotificationManager } = await import('../managers/core/NotificationManager.js');
    const notificationManager = new NotificationManager();
    
    // Show error notification in page
    await notificationManager.show(`Translation Error: ${errorMessage}`, 'error');
    
  } catch (notificationError) {
    logger.error('Failed to show translation error notification:', notificationError);
    
    // Fallback: Try simple alert for critical errors
    try {
      logger.error('Translation Error:', errorMessage);
    } catch {
      // Silent fallback
    }
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    browser.runtime.sendMessage({ action: MessageActions.SHOW_NOTIFICATION_SIMPLE, data: { message: await getTranslationString("STATUS_SMART_TRANSLATE_COPIED"), type: 'success' } });
  } catch (error) {
    browser.runtime.sendMessage({ action: MessageActions.HANDLE_ERROR, data: { error, context: 'smartTranslation-clipboard' } });
  }
}
