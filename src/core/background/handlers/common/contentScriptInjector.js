import browser from 'webextension-polyfill';
import { isRestrictedUrl } from '@/core/tabPermissions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'ContentScriptInjector');

const MAIN_CONTENT_SCRIPT_FILE = 'src/core/content-scripts/index-main.js';
const IFRAME_CONTENT_SCRIPT_FILE = 'src/core/content-scripts/index-iframe.js';

/**
 * Check whether a frame can safely receive the iframe content script.
 * @param {string} url - Frame URL reported by the browser.
 * @returns {boolean} True when the frame is a valid subframe injection target.
 */
function isInjectableSubframeUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  if (isRestrictedUrl(url)) {
    return false;
  }

  return !url.startsWith('javascript:');
}

/**
 * Inject a content script file using the best available browser API.
 * @param {number} tabId - Target tab ID.
 * @param {string} file - Content script file path inside the extension bundle.
 * @param {number[] | undefined} frameIds - Optional target frame IDs.
 * @returns {Promise<void>}
 */
async function executeContentScriptInjection(tabId, file, frameIds) {
  if (browser.scripting?.executeScript) {
    const target = { tabId };

    if (Array.isArray(frameIds) && frameIds.length > 0) {
      target.frameIds = frameIds;
    }

    await browser.scripting.executeScript({
      target,
      files: [file],
    });
    return;
  }

  const [frameId] = frameIds || [];
  await browser.tabs.executeScript(tabId, {
    file,
    allFrames: false,
    ...(typeof frameId === 'number' ? { frameId } : {}),
  });
}

/**
 * Inject the top-frame content script into a tab.
 * @param {number} tabId - Target tab ID.
 * @returns {Promise<void>}
 */
export async function injectMainContentScript(tabId) {
  await executeContentScriptInjection(tabId, MAIN_CONTENT_SCRIPT_FILE, [0]);
}

/**
 * Inject the iframe content script into a specific subframe.
 * @param {number} tabId - Target tab ID.
 * @param {number} frameId - Subframe ID.
 * @returns {Promise<boolean>} True when injection succeeds.
 */
export async function injectIframeContentScript(tabId, frameId) {
  if (!tabId || typeof frameId !== 'number' || frameId <= 0) {
    return false;
  }

  try {
    await executeContentScriptInjection(tabId, IFRAME_CONTENT_SCRIPT_FILE, [frameId]);
    return true;
  } catch (error) {
    logger.debug('Iframe content script injection skipped/failed', {
      tabId,
      frameId,
      error: error?.message || String(error),
    });
    return false;
  }
}

/**
 * Inject the iframe content script into all currently known subframes of a tab.
 * @param {number} tabId - Target tab ID.
 * @returns {Promise<number>} Number of subframes injected successfully.
 */
export async function injectIframeContentScriptsForTab(tabId) {
  if (!tabId || !browser.webNavigation?.getAllFrames) {
    return 0;
  }

  const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => []);
  const injectableFrames = frames.filter((frame) =>
    frame.frameId > 0 && isInjectableSubframeUrl(frame.url)
  );

  if (injectableFrames.length === 0) {
    return 0;
  }

  const results = await Promise.all(
    injectableFrames.map((frame) => injectIframeContentScript(tabId, frame.frameId))
  );

  return results.filter(Boolean).length;
}

/**
 * Inject all content scripts required for a tab after a manual reload/fallback flow.
 * @param {number} tabId - Target tab ID.
 * @returns {Promise<{ mainInjected: boolean, iframeInjectedCount: number }>}
 */
export async function injectContentScriptsForTab(tabId) {
  await injectMainContentScript(tabId);
  const iframeInjectedCount = await injectIframeContentScriptsForTab(tabId);

  return {
    mainInjected: true,
    iframeInjectedCount,
  };
}

/**
 * Check whether a webNavigation event targets an injectable subframe.
 * @param {object} details - webNavigation event details.
 * @returns {boolean} True when iframe script should be injected.
 */
export function shouldInjectIframeScript(details) {
  if (!details || typeof details.tabId !== 'number') {
    return false;
  }

  if (typeof details.frameId !== 'number' || details.frameId <= 0) {
    return false;
  }

  return isInjectableSubframeUrl(details.url);
}
