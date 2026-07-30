import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { EXTENSION_APP_LAUNCH_POLICY } from '@/shared/constants/extensionApps.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleLaunchExtensionApp');

export async function handleLaunchExtensionApp(message) {
  try {
    const { urlPath, launchPolicy } = message?.data || {};

    if (!urlPath) {
      throw new Error('urlPath is required');
    }

    const targetUrl = browser.runtime.getURL(urlPath);

    if (launchPolicy === EXTENSION_APP_LAUNCH_POLICY.ALWAYS_CREATE) {
      logger.debug(`Creating new tab for: ${targetUrl}`);
      await browser.tabs.create({ url: targetUrl });
      return { success: true };
    }

    logger.debug(`Target URL for focusing: ${targetUrl}`);

    const allTabs = await browser.tabs.query({});
    const matchingTabs = allTabs.filter(tab => tab.url && tab.url.includes(urlPath));

    logger.debug(`Found ${matchingTabs.length} matching tabs out of ${allTabs.length} total tabs`);

    if (matchingTabs.length > 0) {
      const targetTab = matchingTabs[0];
      logger.debug(`Focusing tab ${targetTab.id} in window ${targetTab.windowId}`);
      await browser.tabs.update(targetTab.id, { active: true });
      if (targetTab.windowId) {
        await browser.windows.update(targetTab.windowId, { focused: true });
      }
    } else {
      logger.debug(`No matching tabs found, creating new one for ${targetUrl}`);
      await browser.tabs.create({ url: targetUrl });
    }

    return { success: true };
  } catch (error) {
    logger.error('Failed to launch extension app:', error);
    return { success: false, error: error.message };
  }
}
