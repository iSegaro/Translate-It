import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import ExtensionContextManager from '@/core/extensionContext.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

const logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'handlePageTranslation');

// Registry to track which tabs have auto-translation active
// Map<tabId, { targetLanguage: string, settings: object }>
const autoTranslateRegistry = new Map();

/**
 * Handle page translation related messages
 */
export async function handlePageTranslation(message, sender) {
  try {
    const tabId = sender?.tab?.id;

    // Handle batch translation request via UnifiedTranslationService
    if (message.action === MessageActions.PAGE_TRANSLATE_BATCH) {
      return await unifiedTranslationService.handleTranslationRequest(message, sender);
    }

    // Capture state change: Start Auto-Translation
    if (message.action === MessageActions.PAGE_TRANSLATE_COMPLETE && message.data?.isAutoTranslating) {
      if (tabId) {
        autoTranslateRegistry.set(tabId, { 
          active: true, 
          url: message.data.url,
          timestamp: Date.now()
        });
        logger.debug(`Tab ${tabId} added to auto-translate registry`);
      }
    }

    // Capture state change: Stop/Restore Auto-Translation
    if (message.action === MessageActions.PAGE_RESTORE_COMPLETE || message.action === MessageActions.PAGE_AUTO_RESTORE_COMPLETE) {
      if (tabId) {
        autoTranslateRegistry.delete(tabId);
        logger.debug(`Tab ${tabId} removed from auto-translate registry`);
      }
    }

    // Actions that are events originating from content script and need to be broadcasted
    const eventActions = [
      MessageActions.PAGE_TRANSLATE_START,
      MessageActions.PAGE_TRANSLATE_PROGRESS,
      MessageActions.PAGE_TRANSLATE_COMPLETE,
      MessageActions.PAGE_TRANSLATE_ERROR,
      MessageActions.PAGE_RESTORE_COMPLETE,
      MessageActions.PAGE_AUTO_RESTORE_COMPLETE,
      MessageActions.PAGE_RESTORE_ERROR,
      MessageActions.PAGE_TRANSLATE_CANCELLED,
    ];

    if (eventActions.includes(message.action)) {
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

    // Get the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      return { success: false, error: 'No active tab found' };
    }

    const tab = tabs[0];

    try {
      // Get all frames in the tab to ensure we reach every part of the page (especially iframes)
      const hasWebNav = typeof browser !== 'undefined' && browser.webNavigation;
      let allFrames = hasWebNav 
        ? await browser.webNavigation.getAllFrames({ tabId: tab.id }).catch(() => [{ frameId: 0 }])
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
            browser.tabs.sendMessage(tab.id, message, { frameId: frame.frameId }).catch(() => null)
          )
        );
        
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
      const responses = await Promise.all(
        allFrames.map(frame => 
          browser.tabs.sendMessage(tab.id, message, { frameId: frame.frameId }).catch(err => {
            logger.debug(`Could not send to frame ${frame.frameId}:`, err.message);
            return null;
          })
        )
      );

      const success = responses.some(r => r && r.success);
      return { success, responses: responses.filter(Boolean) };
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
