import browser from 'webextension-polyfill';
import {
  injectIframeContentScript,
  shouldInjectIframeScript,
} from '@/core/background/handlers/common/contentScriptInjector.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'SubframeContentScriptListener');

/**
 * Inject the iframe content script only into real subframes once their DOM is ready.
 * Static manifest content scripts cannot target subframes without also hitting the top frame,
 * so this listener keeps the iframe entry scoped to the place where it is actually needed.
 */
async function handleSubframeDOMContentLoaded(details) {
  if (!shouldInjectIframeScript(details)) {
    return;
  }

  const injected = await injectIframeContentScript(details.tabId, details.frameId);

  if (injected) {
    logger.debug('Injected iframe content script into subframe', {
      tabId: details.tabId,
      frameId: details.frameId,
      url: details.url,
    });
  }
}

if (browser.webNavigation?.onDOMContentLoaded) {
  browser.webNavigation.onDOMContentLoaded.addListener(handleSubframeDOMContentLoaded);
  logger.debug('Subframe DOMContentLoaded listener registered');
} else {
  logger.warn('webNavigation.onDOMContentLoaded is not available; iframe auto-injection disabled');
}

export { handleSubframeDOMContentLoaded };
