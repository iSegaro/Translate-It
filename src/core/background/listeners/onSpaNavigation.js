import browser from 'webextension-polyfill';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'SpaNavigationListener');

/**
 * Forward history updates to the matching frame content script.
 * @param {object} details - Browser navigation details.
 * @returns {Promise<void>}
 */
export async function handleSpaNavigation(details) {
  const tabId = details?.tabId;
  const frameId = details?.frameId;

  if (!Number.isInteger(tabId) || tabId < 0 || !Number.isInteger(frameId) || frameId < 0) {
    return;
  }

  try {
    await browser.tabs.sendMessage(tabId, {
      action: MessageActions.SPA_NAVIGATION,
    }, {
      frameId,
    });
  } catch (error) {
    logger.debug('SPA navigation message skipped', {
      tabId,
      frameId,
      error: error?.message || String(error),
    });
  }
}

if (browser.webNavigation?.onHistoryStateUpdated) {
  browser.webNavigation.onHistoryStateUpdated.addListener(handleSpaNavigation);
  logger.debug('SPA navigation listener registered');
}

if (browser.webNavigation?.onReferenceFragmentUpdated) {
  browser.webNavigation.onReferenceFragmentUpdated.addListener(handleSpaNavigation);
  logger.debug('SPA fragment navigation listener registered');
}
