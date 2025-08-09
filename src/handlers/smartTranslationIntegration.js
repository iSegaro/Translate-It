import { MessageContexts, MessagingCore } from "../messaging/core/MessagingCore.js";
import { TranslationMode, getREPLACE_SPECIAL_SITESAsync, getCOPY_REPLACEAsync } from "../config.js";
import { detectPlatform, Platform } from "../utils/browser/platform.js";
import { getTranslationString } from "../utils/i18n/i18n.js";
import { logME } from "../utils/core/helpers.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { isComplexEditor } from "../utils/framework/framework-compat/index.js";

const messenger = MessagingCore.getMessenger(MessageContexts.CONTENT);

function hasActiveElementTextSelection() {
  try {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    if (activeElement.isContentEditable) {
      const selection = window.getSelection();
      return selection && !selection.isCollapsed && selection.toString().trim().length > 0;
    } else if (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA") {
      return activeElement.selectionStart !== activeElement.selectionEnd;
    }
    return false;
  } catch (error) {
    return false;
  }
}

export async function translateFieldViaSmartHandler({ text, target, selectionRange = null, tabId }) {
  logME('[translateFieldViaSmartHandler] Called with:', { text, targetTag: target?.tagName, mode: selectionRange ? 'SelectElement' : 'Field' });
  
  if (!text) {
    logME('[translateFieldViaSmartHandler] No text provided, returning');
    return;
  }

  const mode = selectionRange ? TranslationMode.SelectElement : TranslationMode.Field;
  const platform = detectPlatform(target);

  try {
    // Store target element for later use when translation result arrives
    window.pendingTranslationTarget = target;
    window.pendingTranslationMode = mode;
    window.pendingTranslationPlatform = platform;
    window.pendingTranslationTabId = tabId;
    window.pendingSelectionRange = selectionRange;
    
    logME('[translateFieldViaSmartHandler] Stored pending data:', {
      target: target?.tagName,
      mode,
      platform
    });
    
    // Send translation request - response will be handled by ContentMessageHandler
    logME('[translateFieldViaSmartHandler] Sending translation request...');
    
    // Test connection first
    try {
      const pingResult = await messenger.sendMessage({ action: 'ping', data: { test: true } }, 3000);
      logME('[translateFieldViaSmartHandler] Background connection test:', pingResult);
    } catch (pingError) {
      logME('[translateFieldViaSmartHandler] Background connection FAILED:', pingError);
      throw new Error('Background script not responding - extension may need reload');
    }
    
    const result = await messenger.specialized.translation.translate(text, { 
      translationMode: mode,
      originalText: text 
    });
    
    logME('[translateFieldViaSmartHandler] Translation request result:', result);
    
    // Note: The actual translation result will arrive via TRANSLATION_RESULT_UPDATE message
    // which is handled by ContentMessageHandler and will call applyTranslationToTextField
    
  } catch (err) {
    logME('[translateFieldViaSmartHandler] Error:', err);
    
    // Dismiss notification on error
    if (window.pendingTranslationStatusNode && window.pendingTranslationNotifier) {
      try {
        window.pendingTranslationNotifier.dismiss(window.pendingTranslationStatusNode);
        window.pendingTranslationStatusNode = null;
        window.pendingTranslationNotifier = null;
        logME('[translateFieldViaSmartHandler] Status notification dismissed due to error');
      } catch (notifierError) {
        logME('[translateFieldViaSmartHandler] Failed to dismiss notification on error:', notifierError);
      }
    }
    
    try {
      messenger.sendMessage({ action: 'handleError', data: { error: err, context: 'smartTranslate-handler' } });
    } catch (errorSendError) {
      logME('[translateFieldViaSmartHandler] Failed to send error message:', errorSendError);
    }
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
  logME('[applyTranslationToTextField] Applying translation:', { translatedText, originalText, translationMode });
  
  try {
    // Use stored pending data or fallback to active element
    const target = window.pendingTranslationTarget || document.activeElement;
    const mode = window.pendingTranslationMode || translationMode;
    const platform = window.pendingTranslationPlatform || detectPlatform(target);
    const selectionRange = window.pendingSelectionRange || null;
    const tabId = window.pendingTranslationTabId || null;
    
    logME('[applyTranslationToTextField] Target info:', {
      hasPendingTarget: !!window.pendingTranslationTarget,
      activeElement: document.activeElement?.tagName,
      targetElement: target?.tagName,
      targetIsEditable: isEditableElement(target)
    });
    
    // Clear pending data after use
    window.pendingTranslationTarget = null;
    window.pendingTranslationMode = null;
    window.pendingTranslationPlatform = null;
    window.pendingTranslationTabId = null;
    window.pendingSelectionRange = null;
    
    // Dismiss the status notification if it exists
    if (window.pendingTranslationStatusNode && window.pendingTranslationNotifier) {
      try {
        logME('[applyTranslationToTextField] Attempting to dismiss notification:', {
          statusNode: !!window.pendingTranslationStatusNode,
          notifier: !!window.pendingTranslationNotifier,
          statusNodeType: window.pendingTranslationStatusNode?.constructor.name,
          statusNodeParent: !!window.pendingTranslationStatusNode?.parentNode,
          statusNodeRemove: typeof window.pendingTranslationStatusNode?.remove
        });
        
        window.pendingTranslationNotifier.dismiss(window.pendingTranslationStatusNode);
        window.pendingTranslationStatusNode = null;
        window.pendingTranslationNotifier = null;
        logME('[applyTranslationToTextField] Status notification dismissed successfully');
      } catch (notifierError) {
        logME('[applyTranslationToTextField] Failed to dismiss notification:', notifierError);
      }
    } else {
      logME('[applyTranslationToTextField] No notification to dismiss:', {
        statusNode: !!window.pendingTranslationStatusNode,
        notifier: !!window.pendingTranslationNotifier
      });
    }
    
    if (!target || !isEditableElement(target)) {
      throw new Error('No valid target element found');
    }
    
    const isReplaceMode = await determineReplaceMode(mode, platform);
    logME('[applyTranslationToTextField] Replace mode determined:', isReplaceMode, 'Mode:', mode, 'Platform:', platform);
    
    if (isReplaceMode) {
      logME('[applyTranslationToTextField] Calling applyTranslation...');
      const wasApplied = await applyTranslation(translatedText, selectionRange, platform, tabId, target);
      logME('[applyTranslationToTextField] applyTranslation result:', wasApplied);
      return { applied: wasApplied, mode: 'replace' };
    } else {
      logME('[applyTranslationToTextField] Copy mode - copying to clipboard');
      await copyToClipboard(translatedText);
      return { applied: true, mode: 'copy' };
    }
    
  } catch (error) {
    logME('[applyTranslationToTextField] Error:', error);
    throw error;
  }
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
  logME('[determineReplaceMode] Input:', { mode, platform });
  
  if (mode === TranslationMode.SelectElement) {
    logME('[determineReplaceMode] SelectElement mode -> true');
    return true;
  }

  const isCopy = await getCOPY_REPLACEAsync();
  logME('[determineReplaceMode] COPY_REPLACE setting:', isCopy);
  
  if (isCopy === "replace") {
    logME('[determineReplaceMode] COPY_REPLACE=replace -> true');
    return true;
  }
  if (isCopy === "copy") {
    logME('[determineReplaceMode] COPY_REPLACE=copy -> false');
    return false;
  }

  if (platform !== Platform.Default) {
    const replaceSpecial = await getREPLACE_SPECIAL_SITESAsync();
    logME('[determineReplaceMode] Special platform, REPLACE_SPECIAL_SITES:', replaceSpecial);
    return replaceSpecial;
  }

  const activeElement = document.activeElement;
  const isComplex = isComplexEditor(activeElement);
  const result = !activeElement || !isComplex;
  logME('[determineReplaceMode] Default platform, activeElement:', !!activeElement, 'isComplex:', isComplex, 'result:', result);
  return result;
}

async function applyTranslation(translatedText, selectionRange, platform, tabId, targetElement = null) {
  logME('[applyTranslation] Applying translation directly to element:', { platform, tabId });
  
  try {
    // Use provided target element or fallback
    const target = targetElement || window.pendingTranslationTarget || document.activeElement;
    
    logME('[applyTranslation] Target element info:', {
      providedTarget: !!targetElement,
      targetTag: target?.tagName,
      isEditable: isEditableElement(target)
    });
    
    if (!target || !isEditableElement(target)) {
      logME('[applyTranslation] No valid target element found');
      return false;
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
    
    logME('[applyTranslation] Using strategy:', strategyName, 'for platform:', platform);
    strategyModule = await import(`../strategies/${strategyName}.js`);
    const strategy = new strategyModule.default();
    
    // Apply translation using the strategy
    const success = await strategy.updateElement(target, translatedText);
    logME('[applyTranslation] Strategy updateElement result:', success);
    
    return success;
    
  } catch (err) {
    logME('[applyTranslation] Error:', err);
    return false;
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    messenger.sendMessage({ action: 'showNotification', data: { message: await getTranslationString("STATUS_SMART_TRANSLATE_COPIED"), type: 'success' } });
  } catch (error) {
    messenger.sendMessage({ action: 'handleError', data: { error, context: 'smartTranslation-clipboard' } });
  }
}
