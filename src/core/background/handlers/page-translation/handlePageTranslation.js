import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import ExtensionContextManager from '@/core/extensionContext.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';
import { statsManager } from '@/features/translation/core/TranslationStatsManager.js';
import { tabPermissionChecker } from '@/core/tabPermissions.js';

const logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'handlePageTranslation');

// Registry to track which tabs have auto-translation active
// Map<tabId, { targetLanguage: string, settings: object }>
const autoTranslateRegistry = new Map();

const PAGE_TRANSLATION_FAILURE_FIELDS = [
  'reason',
  'error',
  'errorType',
  'errorDetails',
  'message',
  'isRestrictedPage',
  'tabId',
  'tabUrl',
];

function projectPageTranslationFailure(response, responses) {
  const projected = { success: false };

  for (const field of PAGE_TRANSLATION_FAILURE_FIELDS) {
    if (response[field] !== undefined) projected[field] = response[field];
  }

  return { ...projected, responses };
}

/**
 * Handle page translation related messages
 */
export async function handlePageTranslation(message, sender) {
  try {
    const senderTabId = sender?.tab?.id;

    if (message.action === MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE) {
      const senderFrameId = sender?.frameId;
      const lifecycleAction = message.data?.action;

      if (!Number.isInteger(senderTabId) || !Number.isInteger(senderFrameId) || senderFrameId < 0) {
        return { success: false, error: 'Invalid lifecycle sender' };
      }

      if (!MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE_ACTIONS.includes(lifecycleAction)) {
        return { success: false, error: 'Unsupported page lifecycle action' };
      }

      try {
        const response = await browser.tabs.sendMessage(senderTabId, {
          action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
          data: {
            frameId: senderFrameId,
            action: lifecycleAction,
            data: message.data?.data,
          },
          context: 'page-translation-frame-lifecycle-relay',
        }, { frameId: 0 });

        return response || { success: true };
      } catch (error) {
        logger.debug('Could not relay page lifecycle to top frame:', error.message);
        return { success: false, error: 'Top frame lifecycle relay failed' };
      }
    }

    // Handle batch translation request via UnifiedTranslationService
    if (message.action === MessageActions.PAGE_TRANSLATE_BATCH) {
      return await unifiedTranslationService.handleTranslationRequest(message, sender);
    }

    // Capture state change: Start Auto-Translation
    if (message.action === MessageActions.PAGE_TRANSLATE_COMPLETE && message.data?.isAutoTranslating) {
      if (senderTabId) {
        autoTranslateRegistry.set(senderTabId, { 
          active: true, 
          url: message.data.url,
          timestamp: Date.now()
        });
        logger.debug(`Tab ${senderTabId} added to auto-translate registry`);
      }
    }

    // Capture state change: Stop/Restore Auto-Translation
    if (message.action === MessageActions.PAGE_RESTORE_COMPLETE || message.action === MessageActions.PAGE_AUTO_RESTORE_COMPLETE) {
      if (senderTabId) {
        autoTranslateRegistry.delete(senderTabId);
        logger.debug(`Tab ${senderTabId} removed from auto-translate registry`);
      }
    }

    // Actions that are events originating from content script and need to be broadcasted
    const eventActions = [
      MessageActions.PAGE_TRANSLATE_START,
      MessageActions.PAGE_TRANSLATE_PROGRESS,
      MessageActions.PAGE_TRANSLATE_IDLE,
      MessageActions.PAGE_TRANSLATE_COMPLETE,
      MessageActions.PAGE_TRANSLATE_ERROR,
      MessageActions.PAGE_TRANSLATE_RESET_ERROR,
      MessageActions.PAGE_RESTORE_COMPLETE,
      MessageActions.PAGE_AUTO_RESTORE_COMPLETE,
      MessageActions.PAGE_RESTORE_ERROR,
      MessageActions.PAGE_TRANSLATE_CANCELLED,
    ];

    if (eventActions.includes(message.action)) {
      // Filter out empty/invalid completion messages before broadcasting
      if (message.action === MessageActions.PAGE_TRANSLATE_COMPLETE) {
        const data = message.data || {};
        // Skip completion messages with no meaningful data
        // BUT: Always allow if isAutoTranslating is false (signaling a stop)
        if (!data.translatedCount && !data.totalCount && !data.isTranslated && !data.messageId && data.isAutoTranslating !== false) {
          logger.debug('Skipping empty PAGE_TRANSLATE_COMPLETE message');
          return { success: true };
        }
      }

      // Filter out empty/invalid auto-restore complete messages
      if (message.action === MessageActions.PAGE_AUTO_RESTORE_COMPLETE) {
        const data = message.data || {};
        // Skip auto-restore messages with no translation data
        // BUT: Always allow if isAutoTranslating is false (signaling a stop)
        if (!data.translatedCount && !data.isTranslated && data.isAutoTranslating !== false) {
          logger.debug('Skipping empty PAGE_AUTO_RESTORE_COMPLETE message');
          return { success: true };
        }
      }

      // Log Page Session Summary on completion, cancellation or error
      if (message.action === MessageActions.PAGE_TRANSLATE_COMPLETE ||
          message.action === MessageActions.PAGE_TRANSLATE_CANCELLED ||
          message.action === MessageActions.PAGE_TRANSLATE_ERROR ||
          message.action === MessageActions.PAGE_RESTORE_COMPLETE) {

        // Find session ID in all possible locations - prioritization is key
        const sessionId = message.data?.sessionId ||
                         message.sessionId ||
                         message.data?.messageId ||
                         message.messageId;

        // Clear the coordinator's per-session source-resolution state on any
        // terminal page event so the resolved language never leaks to a new
        // session reusing the same identifier.
        unifiedTranslationService.clearPageSourceSession(sessionId);

        // Map action to status label
        let status = 'Complete';
        if (message.action === MessageActions.PAGE_TRANSLATE_CANCELLED) status = 'Stopped';
        else if (message.action === MessageActions.PAGE_TRANSLATE_ERROR) status = 'Error';
        else if (message.action === MessageActions.PAGE_RESTORE_COMPLETE) status = 'Page Restored';

        // Decide whether to clear based on the action type
        // We only clear on Restore or Cancel, not on "Complete" because of Lazy Loading
        const shouldClear = message.action === MessageActions.PAGE_RESTORE_COMPLETE ||
                           message.action === MessageActions.PAGE_TRANSLATE_CANCELLED;

        statsManager.printSummary(sessionId, {
          status,
          success: message.action !== MessageActions.PAGE_TRANSLATE_ERROR,
          clear: shouldClear
        });
      }

      // Special case: Clear session if a NEW translation starts on the same ID
      if (message.action === MessageActions.PAGE_TRANSLATE_START) {
        const sessionId = message.data?.sessionId || message.data?.messageId;
        if (sessionId) {
          statsManager.clearSession(sessionId);
          unifiedTranslationService.clearPageSourceSession(sessionId);
        }
      }

      browser.runtime.sendMessage(message).catch(() => {});
      return { success: true };
    }

    // Actions that should be forwarded to content scripts
    const forwardActions = [
      MessageActions.PAGE_TRANSLATE,
      MessageActions.PAGE_RESTORE,
      MessageActions.PAGE_TRANSLATE_GET_STATUS,
      MessageActions.PAGE_TRANSLATE_STOP_AUTO,
    ];

    if (!forwardActions.includes(message.action)) {
      return { success: false, error: 'Unknown page translation action' };
    }

    const senderTab = sender?.tab;
    let targetTabId;

    if (senderTab !== undefined && senderTab !== null) {
      if (!Number.isInteger(senderTab.id)) {
        return { success: false, error: 'Invalid sender tab' };
      }
      targetTabId = senderTab.id;
    } else {
      // Extension UI callers without sender.tab retain active-tab behavior.
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs.length) {
        return { success: false, error: 'No active tab found' };
      }
      targetTabId = tabs[0].id;
    }

    const access = await tabPermissionChecker.checkTabAccess(targetTabId);
    if (!access.isAccessible) {
      logger.debug(`Page translation blocked on restricted tab ${targetTabId}: ${access.errorMessage}`);
      return {
        success: false,
        message: access.errorMessage,
        isRestrictedPage: true,
        tabId: targetTabId,
        tabUrl: access.fullUrl,
      };
    }

    try {
      // Get all frames in the tab to ensure we reach every part of the page (especially iframes)
      const hasWebNav = typeof browser !== 'undefined' && browser.webNavigation;
      let allFrames = hasWebNav 
        ? await browser.webNavigation.getAllFrames({ tabId: targetTabId }).catch(() => [{ frameId: 0 }])
        : [{ frameId: 0 }];
      
      // Filter frames to skip common ad domains and non-content frames
      allFrames = allFrames.filter(frame => {
        if (frame.frameId === 0) return true;
        if (!frame.url || frame.url.startsWith('about:') || frame.url.startsWith('javascript:') || frame.url.startsWith('chrome-extension:')) return false;
        
        const adDomains = ['doubleclick.net', 'googleads', 'adnxs.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'advertising.com'];
        if (adDomains.some(domain => frame.url.includes(domain))) return false;
        
        return true;
      });

      if (message.action === MessageActions.PAGE_TRANSLATE_GET_STATUS) {
        const statusResponses = await Promise.all(
          allFrames.map(frame => 
            browser.tabs.sendMessage(targetTabId, message, { frameId: frame.frameId }).catch(() => null)
          )
        );
        
        // 1. Check for an aggregated response (usually from the top frame)
        // This response already contains consolidated stats from all frames
        const aggregatedResponse = statusResponses.find(r => r && r.success && r.isAggregated);
        if (aggregatedResponse) {
          logger.debug('Returning aggregated translation status from main frame');
          return aggregatedResponse;
        }

        // 2. Fallback: Aggregate manually if no aggregated response was found
        const bestResponse = statusResponses.find(r => r && (r.isTranslating || r.isAutoTranslating || r.isTranslated)) || 
                           statusResponses.find(r => r && r.success) || 
                           { success: false, error: 'No active translation found' };
                           
        const totalCount = statusResponses.reduce((acc, r) => acc + (r?.translatedCount || 0), 0);
        const anyAutoTranslating = statusResponses.some(r => r && r.isAutoTranslating && (r.isTranslating || r.isTranslated));
        
        if (bestResponse.success) {
          bestResponse.translatedCount = totalCount;
          bestResponse.isAutoTranslating = anyAutoTranslating;
        }
        
        return bestResponse;
      }

      // Forward TRANSLATE and RESTORE to all frames
      const frameResults = await Promise.all(
        allFrames.map(async (frame) => {
          try {
            const response = await browser.tabs.sendMessage(targetTabId, message, { frameId: frame.frameId });
            return { frameId: frame.frameId, response };
          } catch (err) {
            logger.debug(`Could not send to frame ${frame.frameId}:`, err.message);
            return { frameId: frame.frameId, response: null };
          }
        })
      );

      const responses = frameResults
        .map(({ response }) => response)
        .filter(response => response != null);
      const success = responses.some(response => response.success);

      if (message.action !== MessageActions.PAGE_TRANSLATE || success) {
        return { success, responses };
      }

      const canonicalFailure = frameResults.find(({ frameId, response }) => (
        frameId === 0 && response != null
      ))?.response || frameResults.find(({ response }) => response != null)?.response;

      if (canonicalFailure) {
        return projectPageTranslationFailure(canonicalFailure, responses);
      }

      return {
        success: false,
        error: 'Content script not available',
        isTransportFailure: true,
        responses,
      };
    } catch (sendError) {
      if (ExtensionContextManager.isContextError(sendError)) {
        ExtensionContextManager.handleContextError(sendError, 'page-translation-handler');
      } else {
        logger.warn('Error sending page translation message to content script:', sendError);
      }
      return { success: false, error: 'Content script not available' };
    }
  } catch (error) {
    logger.error('Error handling page translation message:', error);
    return { success: false, error: error.message };
  }
}

// Handle navigation events to persistent auto-translation across same-tab link clicks
if (typeof browser !== 'undefined' && browser.webNavigation) {
  browser.webNavigation.onCommitted.addListener((details) => {
    // Only care about top-level navigation
    if (details.frameId !== 0) return;

    const tabId = details.tabId;
    const transitionType = details.transitionType;

    // Check if this tab was auto-translating
    if (autoTranslateRegistry.has(tabId)) {
      // 1. If it's a RELOAD or manual TYPED entry -> STOP translation as per user requirement
      if (transitionType === 'reload' || transitionType === 'typed') {
        logger.debug(`Stopping auto-translation for tab ${tabId} due to ${transitionType}`);
        autoTranslateRegistry.delete(tabId);
        return;
      }

      // 2. If it's a LINK click or FORM_SUBMIT -> CONTINUE translation
      const allowedPersistence = ['link', 'form_submit', 'auto_bookmark', 'manual_subframe'];
      if (allowedPersistence.includes(transitionType)) {
        logger.debug(`Persisting auto-translation for tab ${tabId} on navigation (${transitionType})`);
        
        // Wait for page to load a bit before sending translate message
        setTimeout(() => {
          browser.tabs.sendMessage(tabId, { action: MessageActions.PAGE_TRANSLATE, data: { isAuto: true } })
            .catch(() => {
              // If fails (page not ready), try once more after 2 seconds
              setTimeout(() => {
                browser.tabs.sendMessage(tabId, { action: MessageActions.PAGE_TRANSLATE, data: { isAuto: true } }).catch(() => {});
              }, 2000);
            });
        }, 1000);
      }
    }
  });

  // Cleanup on tab closure
  browser.tabs.onRemoved.addListener((tabId) => {
    autoTranslateRegistry.delete(tabId);
  });
}
