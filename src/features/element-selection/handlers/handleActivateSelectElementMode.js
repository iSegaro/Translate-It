// src/background/handlers/element-selection/handleActivateSelectElementMode.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageFormat, MessagingContexts } from '@/shared/messaging/core/MessagingCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { tabPermissionChecker } from '@/core/tabPermissions.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { setStateForTab } from './selectElementStateManager.js';
import { getSelectElementActivationErrorMessage } from '../utils/activationError.js';

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
  logger.debug('Starting activation handler:', {
    messageData: message.data,
    senderTab: sender?.tab?.id,
    senderUrl: sender?.url
  });
  
  try {
    const { tabId } = message.data || {};
    let targetTabId = tabId || sender.tab?.id;
    
    // If no tabId available (e.g., from sidepanel), get current active tab
    if (!targetTabId) {
      logger.debug('No tab ID from sender, finding active tab...');
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        targetTabId = tabs[0].id;
        logger.debug(`Found active tab: ${targetTabId}`);
      }
    }
    
    if (!targetTabId) {
      throw new Error('Could not determine target tab for element selection');
    }

    // Check tab permissions before proceeding
    logger.debug('Checking tab access for:', targetTabId);
    const access = await tabPermissionChecker.checkTabAccess(targetTabId);
    logger.debug('Tab access result:', access);
    if (!access.isAccessible) {
      logger.debug(`Attempted to activate on restricted tab ${targetTabId}: ${access.errorMessage}`);
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

    logger.debug(`Message data: ${JSON.stringify(message, null, 2)}`);

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
    
    logger.debug(`Sending ${action} to tab ${targetTabId} with mode: ${modeForContentScript}`);
    
    const contentData = typeof message.data === 'object' && message.data !== null
      ? { ...message.data }
      : {};
    delete contentData.activate;

    const contentMessage = MessageFormat.create(
      action,
      {
        ...contentData,
        mode: modeForContentScript,
        active: isActivating,
      },
      MessagingContexts.CONTENT // Context for content script
    );

    // Use direct browser.tabs.sendMessage for cross-browser compatibility
    let response;
    try {
      response = await browser.tabs.sendMessage(targetTabId, contentMessage);
      logger.debug(`Message sent to tab ${targetTabId}, response:`, response);
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, `activate-select-element:tab-${targetTabId}`);
      } else {
        logger.error(`Failed to send message to tab ${targetTabId}:`, error);
      }
      
      const safeMessage = await getSelectElementActivationErrorMessage();
      return {
        success: false, 
        message: 'Failed to communicate with tab - try refreshing the page',
        tabId: targetTabId,
        activated: false,
        error: safeMessage,
        errorType: ErrorTypes.SELECT_ELEMENT,
        errorDetails: {
          message: safeMessage,
          type: ErrorTypes.SELECT_ELEMENT,
        },
      };
    }
    
    // Check if tab communication actually succeeded
    const statusText = isActivating ? 'activated' : 'deactivated';
    
    // Handle different response types from content script
    if (response === false) {
      // A false response means content did not confirm the requested state.
      logger.debug(`Tab ${targetTabId} returned false without confirming Select Element state`, {
        tabId: targetTabId,
        url: access.fullUrl.substring(0, 80) + (access.fullUrl.length > 80 ? '...' : ''),
        isRestrictedByUrl: access.isRestricted,
        isAccessible: access.isAccessible
      });
      return {
        success: false,
        message: 'Content script did not confirm Select Element state',
        tabId: targetTabId,
        activated: false,
        isLegacyResponse: true,
        isRestrictedPage: access.isRestricted,
        tabUrl: access.fullUrl
      };
    }
    
    // Handle structured error response from content script
    if (response && response.success === false && response.error) {
      logger.debug(`Tab ${targetTabId} returned structured error`, {
        tabId: targetTabId,
        error: response.error,
        errorType: response.errorType,
        isCompatibilityIssue: response.isCompatibilityIssue,
        url: access.fullUrl.substring(0, 80) + (access.fullUrl.length > 80 ? '...' : '')
      });
      
      const safeMessage = await getSelectElementActivationErrorMessage();

      return {
        success: false,
        message: safeMessage,
        error: safeMessage,
        tabId: targetTabId,
        activated: false,
        isRestrictedPage: access.isRestricted, // Use actual permission check, not content script's guess
        isCompatibilityIssue: response.isCompatibilityIssue || false,
        errorType: response.errorType || ErrorTypes.SELECT_ELEMENT,
        errorDetails: {
          message: safeMessage,
          type: response.errorType || ErrorTypes.SELECT_ELEMENT,
        },
        tabUrl: access.fullUrl
      };
    }
    
    const hasExplicitActivationState = response
      && typeof response === 'object'
      && typeof response.activated === 'boolean';
    const reportedActive = hasExplicitActivationState ? response.activated : null;

    // Activation is successful only after content confirms the requested state.
    // Bare true remains supported for legacy content scripts.
    const wasSuccessful = response === true || (
      hasExplicitActivationState
      && response.success !== false
      && reportedActive === isActivating
    );

    if (hasExplicitActivationState && reportedActive === false && response.success !== false) {
      setStateForTab(targetTabId, false);
    }
    
    if (!wasSuccessful) {
      // Only treat as communication failure if response is undefined/null or indicates actual failure
      logger.warn(`Element selection mode communication FAILED for tab ${targetTabId}`, {
        tabId: targetTabId,
        url: access.fullUrl.substring(0, 50) + (access.fullUrl.length > 50 ? '...' : ''),
        response,
        responseType: typeof response
      });
      
      return { 
        success: false, 
         message: isActivating
           ? 'Content script did not confirm Select Element activation'
           : 'Content script did not confirm Select Element deactivation',
        tabId: targetTabId,
        activated: false,
        isRestrictedPage: access.isRestricted,
        tabUrl: access.fullUrl,
        response
      };
    }
    
    // If successful, update the central state, which will broadcast to all UIs
    setStateForTab(targetTabId, isActivating);
    
    logger.info(`Element selection mode ${statusText} in tab ${targetTabId}`);
    
    return { 
      success: true, 
      message: `Element selection mode ${statusText}`,
      tabId: targetTabId,
      activated: isActivating,
      response
    };
  } catch (error) {
    const isContextError = ExtensionContextManager.isContextError(error);
    if (isContextError) {
      ExtensionContextManager.handleContextError(error, 'handleActivateSelectElementMode');
    } else {
      logger.error('Exception in handleActivateSelectElementMode:', error);
    }
    
    const safeMessage = await getSelectElementActivationErrorMessage();
    const displayError = Object.assign(new Error(safeMessage), {
      type: ErrorTypes.SELECT_ELEMENT,
      cause: error,
    });
    if (!isContextError) {
      errorHandler.handle(displayError, {
        type: ErrorTypes.SELECT_ELEMENT,
        context: 'handleActivateSelectElementMode',
        messageData: message,
      });
    }

    const response = {
      success: false,
      message: safeMessage,
      error: safeMessage,
      errorType: ErrorTypes.SELECT_ELEMENT,
      errorDetails: {
        message: safeMessage,
        type: ErrorTypes.SELECT_ELEMENT,
      },
    };
    logger.debug('Returning error response:', response);
    return response;
  }
}
