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
import {
  completeActivationAttempt,
  compensateInvalidatedActivationAttempts,
  createActivationGeneration,
  getActivationAttemptToken,
  invalidateOlderActivationAttempts,
  isActivationAttemptCurrent,
  recordActivationAttemptFrames,
  retainCompatibilityFrames,
  registerParticipant,
  setStateForTab,
  settleActivationAttemptFrame,
} from './selectElementStateManager.js';
import { handleDeactivateSelectElementMode } from './handleDeactivateSelectElementMode.js';
import { getSelectElementActivationErrorMessage } from '../utils/activationError.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'handleActivateSelectElementMode');

const errorHandler = new ErrorHandler();

// Unlike broad extension-context failures, these messages prove no target
// content receiver existed, so this dispatch cannot have activated the frame.
function isProvenNoSelectElementReceiver(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('receiving end does not exist')
    || message.includes('no receiving end')
    || message.includes('no receiver');
}

/**
 * Handles the 'activateSelectElementMode' message action.
 * This activates element selection mode in each reachable frame of a specific tab.
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

    // Route every authoritative inactive request through the cleanup barrier.
    let isActivating;
    let modeForContentScript = 'normal';

    logger.debug(`Message data: ${JSON.stringify(message, null, 2)}`);

    if (typeof message.data === 'boolean') {
      isActivating = message.data;
      modeForContentScript = isActivating ? 'select' : 'normal';
    } else if (message.data && typeof message.data.active === 'boolean') {
      isActivating = message.data.active;
      modeForContentScript = isActivating ? 'select' : 'normal';
    } else if (typeof message === 'object' && message.action === MessageActions.ACTIVATE_SELECT_ELEMENT_MODE) {
      isActivating = true;
      modeForContentScript = 'select';
    } else if (typeof message === 'object' && message.action === MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE) {
      isActivating = false;
    } else {
      isActivating = false;
    }

    if (!isActivating) {
      const deactivationMessage = {
        ...message,
        data: {
          ...(message.data && typeof message.data === 'object' ? message.data : {}),
          tabId: targetTabId,
        },
      };
      const deactivationResult = await handleDeactivateSelectElementMode(deactivationMessage, sender);
      return {
        ...deactivationResult,
        activated: deactivationResult.success === true
          ? false
          : deactivationResult.activated ?? false,
      };
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
    
    const action = MessageActions.ACTIVATE_SELECT_ELEMENT_MODE;
    
    logger.debug(`Sending ${action} to tab ${targetTabId} with mode: ${modeForContentScript}`);
    
    const contentData = typeof message.data === 'object' && message.data !== null
      ? { ...message.data }
      : {};
    delete contentData.activate;
    const activationGeneration = createActivationGeneration(targetTabId);
    const activationAttemptToken = getActivationAttemptToken(targetTabId);

    try {
      const supersededAttempts = invalidateOlderActivationAttempts(targetTabId, activationGeneration);
      await compensateInvalidatedActivationAttempts(targetTabId, supersededAttempts);
      if (!isActivationAttemptCurrent(targetTabId, activationGeneration, activationAttemptToken)) {
        return {
          success: false,
          message: 'Select Element activation was superseded',
          tabId: targetTabId,
          activated: false,
        };
      }

      const contentMessage = MessageFormat.create(
        action,
        {
          ...contentData,
          mode: modeForContentScript,
          active: isActivating,
          activationGeneration,
        },
        MessagingContexts.CONTENT // Context for content script
      );

      // Send activation explicitly so each reachable frame can establish its own ACK.
      const statusText = 'activated';
      let response;
      const frames = browser.webNavigation?.getAllFrames
        ? await browser.webNavigation.getAllFrames({ tabId: targetTabId }).catch(() => [{ frameId: 0 }])
        : [{ frameId: 0 }];
      const frameIds = [...new Set([
        0,
        ...(Array.isArray(frames) ? frames.map(frame => frame?.frameId) : [])
      ])].filter(frameId => Number.isInteger(frameId) && frameId >= 0);
      if (!isActivationAttemptCurrent(targetTabId, activationGeneration, activationAttemptToken)) {
        return {
          success: false,
          message: 'Select Element activation was superseded',
          tabId: targetTabId,
          activated: false,
        };
      }

      const frameResults = await Promise.all(frameIds.map(async frameId => {
        try {
          // Only a dispatched request can leave cleanup ownership behind.
          recordActivationAttemptFrames(targetTabId, activationGeneration, [frameId]);
          const frameResponse = await browser.tabs.sendMessage(
            targetTabId,
            contentMessage,
            { frameId }
          );
          logger.debug(`Message sent to frame ${frameId} in tab ${targetTabId}, response:`, frameResponse);
          return { frameId, response: frameResponse };
        } catch (error) {
          if (isProvenNoSelectElementReceiver(error)) {
            settleActivationAttemptFrame(targetTabId, activationGeneration, frameId);
          }
          if (ExtensionContextManager.isContextError(error)) {
            ExtensionContextManager.handleContextError(error, `activate-select-element:tab-${targetTabId}:frame-${frameId}`);
          } else {
            logger.error(`Failed to send activation to frame ${frameId} in tab ${targetTabId}:`, error);
          }
          return { frameId, error };
        }
      }));

      const hasGenerationEcho = frameResponse => (
        frameResponse
        && typeof frameResponse === 'object'
        && Object.prototype.hasOwnProperty.call(frameResponse, 'activationGeneration')
      );
      const strictResults = frameResults.filter(({ response: frameResponse }) => (
        frameResponse?.success === true
        && frameResponse?.activated === true
        && frameResponse?.activationGeneration === activationGeneration
      ));
      const compatibilityFrameIds = frameResults
        .filter(({ response: frameResponse }) => (
          frameResponse === true
          || (
            frameResponse?.success === true
            && frameResponse?.activated === true
            && !hasGenerationEcho(frameResponse)
          )
        ))
        .map(({ frameId }) => frameId);
      for (const { frameId, response: frameResponse } of frameResults) {
        if (
          frameResponse === false
          || (frameResponse?.success === false && frameResponse?.activated === false)
        ) {
          settleActivationAttemptFrame(targetTabId, activationGeneration, frameId);
        }
      }

      if (strictResults.length > 0) {
        if (!isActivationAttemptCurrent(targetTabId, activationGeneration, activationAttemptToken)) {
          return {
            success: false,
            message: 'Select Element activation was superseded',
            tabId: targetTabId,
            activated: false,
            response: strictResults[0].response,
          };
        }

        const registeredResults = strictResults.filter(({ frameId }) => (
          registerParticipant(targetTabId, frameId, activationGeneration)
        ));
        for (const { frameId } of registeredResults) {
          settleActivationAttemptFrame(targetTabId, activationGeneration, frameId);
        }
        if (compatibilityFrameIds.length > 0) {
          retainCompatibilityFrames(targetTabId, activationGeneration, compatibilityFrameIds);
          for (const frameId of compatibilityFrameIds) {
            settleActivationAttemptFrame(targetTabId, activationGeneration, frameId);
          }
        }

        if (registeredResults.length > 0) {
          setStateForTab(targetTabId, true);

          logger.info(`Element selection mode activated in ${registeredResults.length} frame(s) of tab ${targetTabId}`);
        }

        return {
          success: true,
          message: `Element selection mode ${statusText}`,
          tabId: targetTabId,
          activated: true,
          response: strictResults[0].response,
        };
      }

      const compatibilityResult = frameResults.find(({ response: frameResponse }) => (
        frameResponse === true
        || (
          frameResponse?.success === true
          && frameResponse?.activated === true
          && !hasGenerationEcho(frameResponse)
        )
      ));
      if (compatibilityResult) {
        retainCompatibilityFrames(
          targetTabId,
          activationGeneration,
          compatibilityFrameIds,
        );
        for (const frameId of compatibilityFrameIds) {
          settleActivationAttemptFrame(targetTabId, activationGeneration, frameId);
        }
        logger.info(`Element selection mode ${statusText} in tab ${targetTabId} via compatibility response`);
        return {
          success: true,
          message: `Element selection mode ${statusText}`,
          tabId: targetTabId,
          activated: true,
          response: compatibilityResult.response,
        };
      }

      response = frameResults.find(({ response: frameResponse }) => frameResponse !== undefined)?.response;
      if (response === undefined && frameResults.some(result => result.error)) {
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
    
      logger.warn(`Element selection mode communication FAILED for tab ${targetTabId}`, {
        tabId: targetTabId,
        url: access.fullUrl.substring(0, 50) + (access.fullUrl.length > 50 ? '...' : ''),
        response,
        responseType: typeof response
      });

      return {
        success: false,
        message: 'Content script did not confirm Select Element activation',
        tabId: targetTabId,
        activated: false,
        isRestrictedPage: access.isRestricted,
        tabUrl: access.fullUrl,
        response,
      };
    } finally {
      completeActivationAttempt(targetTabId, activationGeneration, activationAttemptToken);
    }
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
