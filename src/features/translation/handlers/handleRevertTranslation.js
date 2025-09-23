// src/background/handlers/translation/handleRevertTranslation.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { generateRevertMessageId } from '@/utils/messaging/messageId.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { tabPermissionChecker } from '@/core/tabPermissions.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'handleRevertTranslation');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'revertTranslation' message action.
 * This reverts a translation on a webpage to its original text.
 * Supports both Vue-based (new) and legacy (old) translation systems.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleRevertTranslation(message, sender, sendResponse) {
  logger.debug('[Handler:revertTranslation] Processing translation revert request:', message.data);

  try {
    let targetTabId = message.data?.tabId || sender.tab?.id;

    // If no tab ID available (e.g., from sidepanel), get active tab
    if (!targetTabId) {
      logger.debug('[Handler:revertTranslation] No tab ID in message, getting active tab');
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        targetTabId = activeTab.id;
        logger.debug('[Handler:revertTranslation] Using active tab ID:', targetTabId);
      } else {
        throw new Error('Unable to determine target tab for translation revert');
      }
    }

    // Check tab permissions before proceeding (same pattern as Select Element)
    logger.debug('[Handler:revertTranslation] Checking tab access for:', targetTabId);
    const access = await tabPermissionChecker.checkTabAccess(targetTabId);
    logger.debug('[Handler:revertTranslation] Tab access result:', access);

    if (!access.isAccessible) {
      logger.debug(`[Handler:revertTranslation] Attempted to revert on restricted tab ${targetTabId}: ${access.errorMessage}`);
      sendResponse({
        success: false,
        message: access.errorMessage,
        tabId: targetTabId,
        revertedCount: 0,
        isRestrictedPage: true,
        tabUrl: access.fullUrl,
      });
      return true;
    }

    // Send revert message to content script - let it decide which system to use
    const revertMessage = {
      action: MessageActions.REVERT_SELECT_ELEMENT_MODE,
      context: 'revert-handler',
      messageId: generateRevertMessageId('background'),
      data: {
        ...message.data,
        fromBackground: true
      }
    };

    logger.debug(`📤 [revertTranslation] Sending revert message to content script:`, {
      tabId: targetTabId,
      action: revertMessage.action,
      messageId: revertMessage.messageId
    });

    const contentScriptResponse = await browser.tabs.sendMessage(targetTabId, revertMessage);

    logger.info(`📨 [revertTranslation] Content script response:`, {
      response: contentScriptResponse,
      responseType: typeof contentScriptResponse
    });

    // Handle response directly
    if (contentScriptResponse && contentScriptResponse.success) {
      logger.info(`✅ [revertTranslation] Translation reverted successfully for tab ${targetTabId}:`, contentScriptResponse);

      sendResponse({
        success: true,
        message: contentScriptResponse.message || 'Translation reverted successfully',
        tabId: targetTabId,
        revertedCount: contentScriptResponse.revertedCount || 0,
        system: contentScriptResponse.system || 'unknown'
      });
    } else {
      const errorMessage = contentScriptResponse?.error || 'Content script revert failed';
      logger.warn(`❌ [revertTranslation] Content script returned failure for tab ${targetTabId}:`, {
        response: contentScriptResponse,
        error: errorMessage
      });
      throw new Error(errorMessage);
    }

    return true;
  } catch (error) {
    logger.error('[Handler:revertTranslation] Error:', error);

    errorHandler.handle(error, {
      type: ErrorTypes.TRANSLATION,
      context: "handleRevertTranslation",
      messageData: message,
      isSilent: true // Silent error handling for tab restrictions
    });

    sendResponse({
      success: false,
      error: error.message || 'Translation revert failed'
    });
    return false;
  }
}