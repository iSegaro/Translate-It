// src/background/handlers/element-selection/handleActivateSelectElementMode.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageFormat, MessagingContexts } from '@/shared/messaging/core/MessagingCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { tabPermissionChecker } from '@/core/tabPermissions.js';
import { setStateForTab } from './selectElementStateManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'handleActivateSelectElementMode');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'activateSelectElementMode' message action.
 * This activates element selection mode in a specific tab.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - Promise that resolves with the response object.
 */
export async function handleActivateSelectElementMode(message, sender) {
  logger.debug('[Handler:activateSelectElementMode] Processing element selection activation:', message.data);
  
  try {
    const { tabId } = message.data || {};
    let targetTabId = tabId || sender.tab?.id;
    
    // If no tabId available (e.g., from sidepanel), get current active tab
    if (!targetTabId) {
      logger.debug('[Handler:activateSelectElementMode] No tab ID from sender, finding active tab...');
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        targetTabId = tabs[0].id;
        logger.debug(`[Handler:activateSelectElementMode] Found active tab: ${targetTabId}`);
      }
    }
    
    if (!targetTabId) {
      throw new Error('Could not determine target tab for element selection');
    }

    // Check tab permissions before proceeding
    const access = await tabPermissionChecker.checkTabAccess(targetTabId);
    if (!access.isAccessible) {
      logger.warn(`[Handler:activateSelectElementMode] Attempted to activate on restricted tab ${targetTabId}: ${access.errorMessage}`);
      return {
        success: false,
        message: access.errorMessage,
        tabId: targetTabId,
        activated: false,
        isRestrictedPage: true,
        tabUrl: access.fullUrl,
      };
    }
    
    // Determine if activating or deactivating based on message.data
    let isActivating;
    let modeForContentScript = 'normal';

    logger.debug(`[Handler:activateSelectElementMode] Message data: ${JSON.stringify(message, null, 2)}`);

    if (typeof message.data === 'boolean') {
      isActivating = message.data;
      modeForContentScript = isActivating ? 'select' : 'normal';
    } else if (message.data && typeof message.data.active === 'boolean') {
      // Handle data: { active: true/false } format from useTranslationModes
      isActivating = message.data.active;
      modeForContentScript = isActivating ? 'select' : 'normal';
    } else if (typeof message === 'object' && message.action === MessageActions.ACTIVATE_SELECT_ELEMENT_MODE) {
      isActivating = true;
      modeForContentScript = 'select';
    } else if (typeof message === 'object' && message.action === MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE) {
      isActivating = false;
      modeForContentScript = 'normal';
    } else {
      isActivating = false; // Default to deactivating if data is unclear
    }

    const action = isActivating ? MessageActions.ACTIVATE_SELECT_ELEMENT_MODE : MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE;
    
    logger.debug(`[Handler:activateSelectElementMode] Sending ${action} to tab ${targetTabId} with mode: ${modeForContentScript}`);
    
    const contentMessage = MessageFormat.create(
      action,
      {
        mode: modeForContentScript,
        activate: isActivating,
      },
      MessagingContexts.CONTENT // Context for content script
    );

    // Use direct browser.tabs.sendMessage for cross-browser compatibility
    const response = await browser.tabs.sendMessage(targetTabId, contentMessage);
    
    // Check if tab communication actually succeeded
    const statusText = isActivating ? 'activated' : 'deactivated';
    const wasSuccessful = response && !response.tabUnavailable && !response.gracefulFailure;
    
    if (!wasSuccessful) {
      // This case should now be rare, but kept as a fallback.
      // The permission check above should catch most issues.
      logger.warn(`⚠️ [activateSelectElementMode] Element selection mode communication FAILED for tab ${targetTabId}`, {
        tabId: targetTabId,
        url: access.fullUrl.substring(0, 50) + (access.fullUrl.length > 50 ? '...' : ''),
        response
      });
      
      return { 
        success: false, 
        message: 'Tab is not accessible - try refreshing the page',
        tabId: targetTabId,
        activated: false,
        isRestrictedPage: access.isRestricted,
        tabUrl: access.fullUrl,
        response
      };
    }
    
    // If successful, update the central state, which will broadcast to all UIs
    setStateForTab(targetTabId, isActivating);
    
    logger.info(`✅ [activateSelectElementMode] Element selection mode ${statusText} in tab ${targetTabId}`);
    
    return { 
      success: true, 
      message: `Element selection mode ${statusText}`,
      tabId: targetTabId,
      activated: isActivating,
      response
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SELECT_ELEMENT,
      context: "handleActivateSelectElementMode",
      messageData: message
    });
    return { success: false, error: error.message || 'Element selection activation failed' };
  }
}